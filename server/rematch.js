const REMATCH_TTL_MS = 30_000

// Active rematch slots: roomId → { entries: Map<socketId, { socket, side }>, accepted: Set, timer }
const slots = new Map()

function clearSlot(roomId) {
  const existing = slots.get(roomId)
  if (existing) {
    clearTimeout(existing.timer)
    slots.delete(roomId)
  }
}

/**
 * Called by the match-end handler. Tags both sockets and opens a 30-second rematch window.
 */
export function openRematchSlot(roomId, leftSocket, rightSocket) {
  clearSlot(roomId)

  leftSocket.data.lastRoomId = roomId
  rightSocket.data.lastRoomId = roomId

  const entries = new Map([
    [leftSocket.id, { socket: leftSocket, side: 'left' }],
    [rightSocket.id, { socket: rightSocket, side: 'right' }],
  ])

  const slot = {
    entries,
    accepted: new Set(),
    timer: setTimeout(() => {
      for (const [, { socket }] of entries) {
        if (slot.accepted.has(socket.id)) {
          socket.emit('rematchDeclined')
        }
      }
      slots.delete(roomId)
    }, REMATCH_TTL_MS),
  }

  slots.set(roomId, slot)
}

/**
 * Handle a 'requestRematch' event from a socket.
 *
 * Returns { matched: true, leftSocket, rightSocket } when both players accept,
 * or { matched: false } when still waiting / declined.
 *
 * The caller is responsible for calling createRoom and emitting matchFound.
 */
export function handleRequestRematch(socket) {
  const roomId = socket.data.lastRoomId
  if (!roomId) {
    socket.emit('rematchDeclined')
    return { matched: false }
  }

  const slot = slots.get(roomId)
  if (!slot) {
    socket.emit('rematchDeclined')
    return { matched: false }
  }

  if (!slot.entries.has(socket.id)) {
    socket.emit('rematchDeclined')
    return { matched: false }
  }

  // Idempotent: ignore duplicate accepts
  if (slot.accepted.has(socket.id)) return { matched: false }
  slot.accepted.add(socket.id)

  if (slot.accepted.size < 2) {
    socket.emit('rematchWaiting')
    return { matched: false }
  }

  // Both accepted — tear down the slot and return the pair
  clearTimeout(slot.timer)
  slots.delete(roomId)

  const [leftEntry, rightEntry] = [...slot.entries.values()]

  if (!leftEntry.socket.connected || !rightEntry.socket.connected) {
    for (const [, { socket: s }] of slot.entries) s.emit('rematchDeclined')
    return { matched: false }
  }

  return { matched: true, leftSocket: leftEntry.socket, rightSocket: rightEntry.socket }
}

export function getSlotCount() {
  return slots.size
}
