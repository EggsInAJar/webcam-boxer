import { createRoom } from './gameRoom.js'
import { logger } from './lib/logger.js'

const MAX_QUEUE_SIZE = 100
const MAX_WAIT_MS = 5 * 60_000 // 5 minutes

// Queue of waiting sockets: { socket, guestId, rating, enqueuedAt }
const queue = []

export function handleFindMatch(socket, io) {
  // Remove any stale entry for this guest (prevent double-queueing)
  const staleIdx = queue.findIndex(
    (e) => e.socket.id === socket.id || (socket.data.guestId && e.guestId === socket.data.guestId)
  )
  if (staleIdx !== -1) queue.splice(staleIdx, 1)

  // Evict disconnected or stale waiters before checking queue length
  const now = Date.now()
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i]
    if (!e.socket.connected || now - e.enqueuedAt > MAX_WAIT_MS) {
      queue.splice(i, 1)
    }
  }

  if (queue.length >= MAX_QUEUE_SIZE) {
    socket.emit('queueFull')
    return
  }

  if (queue.length > 0) {
    const waiting = queue.shift()
    const roomId = createRoom(io, waiting.socket, socket)

    // Emit matchFound to both players with their side
    io.to(waiting.socket.id).emit('matchFound', {
      room: roomId,
      side: 'left',
      opponentUsername: socket.data.username ?? null,
      opponentRating: socket.data.rating ?? 1200,
    })
    io.to(socket.id).emit('matchFound', {
      room: roomId,
      side: 'right',
      opponentUsername: waiting.socket.data.username ?? null,
      opponentRating: waiting.socket.data.rating ?? 1200,
    })

    logger.info(
      { roomId: roomId.slice(0, 8), left: waiting.socket.id.slice(0, 6), right: socket.id.slice(0, 6) },
      'match made'
    )
  } else {
    queue.push({
      socket,
      guestId: socket.data.guestId ?? null,
      rating: socket.data.rating ?? 1200,
      enqueuedAt: Date.now(),
    })
    logger.info({ socketId: socket.id.slice(0, 6), queueSize: queue.length }, 'queued for match')
  }
}

export function removeFromQueue(socketId) {
  const idx = queue.findIndex((e) => e.socket.id === socketId)
  if (idx !== -1) {
    queue.splice(idx, 1)
    logger.info({ socketId: socketId.slice(0, 6), queueSize: queue.length }, 'removed from queue')
  }
}
