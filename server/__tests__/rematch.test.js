import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { openRematchSlot, handleRequestRematch } from '../rematch.js'

function makeSocket(id, side) {
  const emitted = []
  return {
    id,
    connected: true,
    data: { side, guestId: `guest-${id}`, username: null, rating: 1200 },
    emit(event, payload) { emitted.push({ event, payload }) },
    join() {},
    _emitted: emitted,
  }
}

function makeIo(sockets) {
  return {
    sockets: { sockets: new Map(sockets.map((s) => [s.id, s])) },
    to() { return { emit() {} } },
  }
}

describe('rematch slots', () => {
  let leftSocket, rightSocket, io

  beforeEach(() => {
    leftSocket = makeSocket('left1', 'left')
    rightSocket = makeSocket('right1', 'right')
    io = makeIo([leftSocket, rightSocket])
  })

  it('tags sockets with lastRoomId after openRematchSlot', () => {
    openRematchSlot('room-abc', leftSocket, rightSocket)
    assert.equal(leftSocket.data.lastRoomId, 'room-abc')
    assert.equal(rightSocket.data.lastRoomId, 'room-abc')
  })

  it('emits rematchWaiting to the first acceptor', () => {
    openRematchSlot('room-abc', leftSocket, rightSocket)
    handleRequestRematch(leftSocket)
    const ev = leftSocket._emitted.find((e) => e.event === 'rematchWaiting')
    assert.ok(ev, 'expected rematchWaiting event')
  })

  it('emits rematchDeclined if no slot exists for the socket', () => {
    // No openRematchSlot called — slot is absent
    leftSocket.data.lastRoomId = 'nonexistent-room'
    handleRequestRematch(leftSocket)
    const ev = leftSocket._emitted.find((e) => e.event === 'rematchDeclined')
    assert.ok(ev, 'expected rematchDeclined event')
  })

  it('emits rematchDeclined if socket has no lastRoomId', () => {
    handleRequestRematch(leftSocket)
    const ev = leftSocket._emitted.find((e) => e.event === 'rematchDeclined')
    assert.ok(ev, 'expected rematchDeclined event')
  })

  it('returns matched pair when both accept', () => {
    openRematchSlot('room-abc', leftSocket, rightSocket)
    handleRequestRematch(leftSocket)
    const second = handleRequestRematch(rightSocket)
    assert.equal(second.matched, true)
    assert.equal(second.leftSocket.id, 'left1')
    assert.equal(second.rightSocket.id, 'right1')
  })

  it('does not emit matchFound twice if one player accepts twice', () => {
    openRematchSlot('room-abc', leftSocket, rightSocket)
    handleRequestRematch(leftSocket)
    handleRequestRematch(leftSocket) // duplicate
    const found = leftSocket._emitted.filter((e) => e.event === 'matchFound')
    assert.equal(found.length, 0, 'duplicate accept should not trigger matchFound alone')
  })
})
