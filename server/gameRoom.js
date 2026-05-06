import { randomUUID } from 'node:crypto'
import { createRoomState, applyPunchToState, resolveRound, setBlocking, clearBlocking } from './lib/gameState.js'
import { parsePunch } from './lib/validate.js'
import { recordMatch } from './lib/db.js'
import { logger } from './lib/logger.js'
import { ROUND_DURATION } from './lib/constants.js'
import { openRematchSlot } from './rematch.js'

// Active rooms: roomId → RoomEntry
const rooms = new Map()

const TICK_MS = 1000           // timer ticks every second
const ROUND_END_DELAY_MS = 3000
const FORFEIT_GRACE_MS = 10_000 // wait before counting disconnect as forfeit

/**
 * Create a room from two matched sockets.
 * Called by matchmaking after pairing.
 */
export function createRoom(io, leftSocket, rightSocket) {
  const roomId = randomUUID()

  leftSocket.join(roomId)
  rightSocket.join(roomId)
  leftSocket.data.room = roomId
  rightSocket.data.room = roomId
  leftSocket.data.side = 'left'
  rightSocket.data.side = 'right'

  const state = {
    ...createRoomState(
      leftSocket.data.guestId ?? null,
      rightSocket.data.guestId ?? null,
    ),
    phase: 'waiting', // timer starts only after both players signal ready
  }

  const entry = {
    id: roomId,
    io,
    sockets: { left: leftSocket, right: rightSocket },
    state,
    intervalId: null,
    roundEndTimer: null,
    forfeitTimers: {},
    ready: new Set(),
  }

  rooms.set(roomId, entry)
  // Timer starts in handlePlayerReady once both players are calibrated

  logger.info(
    { roomId: roomId.slice(0, 8), left: leftSocket.id.slice(0, 6), right: rightSocket.id.slice(0, 6) },
    'room created'
  )

  return roomId
}

/**
 * Called when a player finishes calibration and is ready to fight.
 * Starts the round timer only after both players have signalled ready.
 */
export function handlePlayerReady(socket) {
  const room = socket.data.room
  if (!room) return
  const entry = rooms.get(room)
  if (!entry || entry.state.phase !== 'waiting') return

  entry.ready.add(socket.id)
  logger.info({ roomId: room.slice(0, 8), socketId: socket.id.slice(0, 6), readyCount: entry.ready.size }, 'player ready')

  if (entry.ready.size >= 2) {
    entry.state = { ...entry.state, phase: 'fighting' }
    entry.io.to(room).emit('roundStart', { round: entry.state.round })
    startRoundTimer(entry)
    logger.info({ roomId: room.slice(0, 8) }, 'both players ready — round started')
  }
}

function startRoundTimer(entry) {
  clearRoundTimer(entry)
  entry.intervalId = setInterval(() => {
    entry.state = { ...entry.state, timer: Math.max(0, entry.state.timer - 1) }
    if (entry.state.timer <= 0) {
      clearRoundTimer(entry)
      endRound(entry, 'timeout')
    }
  }, TICK_MS)
}

function clearRoundTimer(entry) {
  if (entry.intervalId) {
    clearInterval(entry.intervalId)
    entry.intervalId = null
  }
}

function endRound(entry, reason) {
  clearRoundTimer(entry)
  entry.state = resolveRound(entry.state)
  const { state } = entry

  const roundResult = {
    round: state.round - (state.phase === 'gameOver' ? 0 : 1),
    roundWinner: state.roundWinner,
    hpLeft: state.sides.left.hp,
    hpRight: state.sides.right.hp,
    roundsWonLeft: state.sides.left.roundsWon,
    roundsWonRight: state.sides.right.roundsWon,
  }

  entry.io.to(entry.id).emit('roundResult', roundResult)

  if (state.phase === 'gameOver') {
    endMatch(entry, reason)
  } else {
    // Auto-start next round after delay
    entry.roundEndTimer = setTimeout(() => {
      entry.state = { ...entry.state, phase: 'fighting', timer: ROUND_DURATION }
      entry.io.to(entry.id).emit('roundStart', { round: entry.state.round })
      startRoundTimer(entry)
    }, ROUND_END_DELAY_MS)
  }
}

async function endMatch(entry, reason) {
  clearRoundTimer(entry)
  const { state } = entry

  const winnerId =
    state.matchWinner === 'left'  ? state.sides.left.guestId :
    state.matchWinner === 'right' ? state.sides.right.guestId :
    null

  const result = {
    winnerId,
    winnerSide: state.matchWinner ?? null,
    roundsWonLeft: state.sides.left.roundsWon,
    roundsWonRight: state.sides.right.roundsWon,
    reason,
    ratingDelta: 0, // clients get per-player delta via ratingUpdate below
  }

  entry.io.to(entry.id).emit('matchResult', result)
  logger.info({ roomId: entry.id.slice(0, 8), winnerId, reason }, 'match ended')

  // Open a rematch slot before deleting the room so sockets can be tagged
  openRematchSlot(entry.id, entry.sockets.left, entry.sockets.right)

  rooms.delete(entry.id)

  // Persist and emit per-player rating updates
  const pA = state.sides.left.guestId
  const pB = state.sides.right.guestId
  if (pA && pB) {
    recordMatch({
      playerAId: pA,
      playerBId: pB,
      winnerSide: state.matchWinner ?? null,
      sides: state.sides,
      endedReason: reason,
    })
      .then((res) => {
        if (!res) return
        const { deltaA, deltaB, newRatingA, newRatingB } = res
        // Emit individual rating updates so each player sees their own delta
        entry.sockets.left.emit('ratingUpdate', {
          before: newRatingA - deltaA,
          after: newRatingA,
          delta: deltaA,
        })
        entry.sockets.right.emit('ratingUpdate', {
          before: newRatingB - deltaB,
          after: newRatingB,
          delta: deltaB,
        })
      })
      .catch((err) => logger.error({ err }, 'recordMatch failed'))
  }
}

/**
 * Handle a punch event from a socket.
 * Returns false if the socket is not in a valid room.
 */
export function handlePunch(socket, rawPayload) {
  const result = parsePunch(rawPayload)
  if (!result.success) return

  const { room, punch } = result.data
  if (socket.data.room !== room) return

  const entry = rooms.get(room)
  if (!entry || entry.state.phase !== 'fighting') return

  const fromSide = socket.data.side
  if (!fromSide) return

  // Apply authoritatively on server
  entry.state = applyPunchToState(entry.state, fromSide, punch)

  // Relay punch to opponent for their optimistic display
  socket.to(room).emit('opponentPunch', punch)

  // Check for KO
  const toSide = fromSide === 'left' ? 'right' : 'left'
  if (entry.state.sides[toSide].hp === 0) {
    endRound(entry, 'ko')
  }
}

/**
 * Handle disconnect. Starts a forfeit grace period.
 */
export function handleDisconnect(socket) {
  const room = socket.data.room
  if (!room) return

  const entry = rooms.get(room)
  if (!entry) return

  // Notify opponent immediately
  socket.to(room).emit('opponentLeft')

  const gracePeriodMs = entry.state.phase === 'fighting' ? FORFEIT_GRACE_MS : 0

  entry.forfeitTimers[socket.id] = setTimeout(async () => {
    if (!rooms.has(room)) return // match already ended naturally

    const disconnectedSide = socket.data.side
    const disconnectedHp = disconnectedSide ? entry.state.sides[disconnectedSide].hp : 0
    const opponentSide = disconnectedSide === 'left' ? 'right' : 'left'
    const opponentHp = opponentSide ? entry.state.sides[opponentSide].hp : 0
    const roundCompleted = entry.state.round > 1 || entry.state.sides.left.roundsWon > 0 || entry.state.sides.right.roundsWon > 0

    // Forfeit counts as loss if: a round completed, OR disconnecting player was trailing
    if (roundCompleted || disconnectedHp < opponentHp) {
      // Force the disconnected side to 0 HP and end the round
      if (disconnectedSide) {
        entry.state = {
          ...entry.state,
          sides: {
            ...entry.state.sides,
            [disconnectedSide]: { ...entry.state.sides[disconnectedSide], hp: 0 },
          },
        }
      }
      endRound(entry, 'forfeit')
    } else {
      // No rounds played and player was not trailing — no ELO change, just close room
      clearRoundTimer(entry)
      entry.io.to(room).emit('matchResult', {
        winnerId: null, winnerSide: null, reason: 'disconnect', ratingDelta: 0,
      })
      rooms.delete(room)
    }
  }, gracePeriodMs)
}

export function getRoomCount() {
  return rooms.size
}
