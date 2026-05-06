import { io, Socket } from 'socket.io-client'
import type { PunchType } from './types'

const URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001'

const VALID_PUNCHES = new Set<string>(['jab', 'cross', 'hook', 'uppercut', 'block'])

export type MatchFoundPayload = {
  room: string
  side: 'left' | 'right'
  opponentUsername: string | null
  opponentRating: number
}

export type RoundResultPayload = {
  round: number
  roundWinner: 'left' | 'right' | null
  hpLeft: number
  hpRight: number
  roundsWonLeft: number
  roundsWonRight: number
}

export type MatchResultPayload = {
  winnerId: string | null
  winnerSide: 'left' | 'right' | null
  roundsWonLeft: number
  roundsWonRight: number
  reason: 'ko' | 'timeout' | 'disconnect' | 'forfeit'
  ratingDelta: number
}

export type RatingUpdatePayload = {
  before: number
  after: number
  delta: number
}

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io(URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    })
  }
  return socket
}

export const socketClient = {
  connect(auth?: { guestId: string; token: string }) {
    const s = getSocket()
    if (auth) {
      s.auth = auth
    }
    s.connect()
  },

  disconnect() {
    socket?.disconnect()
    socket = null
  },

  findMatch() {
    getSocket().emit('findMatch')
  },

  sendReady() {
    getSocket().emit('ready')
  },

  sendPunch(room: string, punch: PunchType) {
    getSocket().emit('punch', { room, punch })
  },

  onMatchFound(cb: (payload: MatchFoundPayload) => void) {
    const handler = (raw: unknown) => {
      const p = raw as Record<string, unknown>
      if (typeof p?.room === 'string' && p.room.length > 0 &&
          (p.side === 'left' || p.side === 'right')) {
        cb({
          room: p.room,
          side: p.side as 'left' | 'right',
          opponentUsername: typeof p.opponentUsername === 'string' ? p.opponentUsername : null,
          opponentRating: typeof p.opponentRating === 'number' ? p.opponentRating : 1200,
        })
      }
    }
    getSocket().on('matchFound', handler)
    return () => getSocket().off('matchFound', handler)
  },

  onOpponentPunch(cb: (punch: PunchType) => void) {
    const handler = (raw: unknown) => {
      if (typeof raw === 'string' && VALID_PUNCHES.has(raw)) {
        cb(raw as PunchType)
      }
    }
    getSocket().on('opponentPunch', handler)
    return () => getSocket().off('opponentPunch', handler)
  },

  onRoundResult(cb: (payload: RoundResultPayload) => void) {
    const handler = (raw: unknown) => {
      const p = raw as RoundResultPayload
      if (typeof p?.hpLeft === 'number' && typeof p?.hpRight === 'number') cb(p)
    }
    getSocket().on('roundResult', handler)
    return () => getSocket().off('roundResult', handler)
  },

  onRoundStart(cb: (payload: { round: number }) => void) {
    const handler = (raw: unknown) => {
      const p = raw as { round: number }
      if (typeof p?.round === 'number') cb(p)
    }
    getSocket().on('roundStart', handler)
    return () => getSocket().off('roundStart', handler)
  },

  onMatchResult(cb: (payload: MatchResultPayload) => void) {
    const VALID_REASONS = new Set(['ko', 'timeout', 'forfeit', 'disconnect'])
    const handler = (raw: unknown) => {
      const p = raw as MatchResultPayload
      if (p && VALID_REASONS.has(p.reason)) cb(p)
    }
    getSocket().on('matchResult', handler)
    return () => getSocket().off('matchResult', handler)
  },

  onRatingUpdate(cb: (payload: RatingUpdatePayload) => void) {
    const handler = (raw: unknown) => {
      const p = raw as RatingUpdatePayload
      if (typeof p?.after === 'number' && typeof p?.delta === 'number') cb(p)
    }
    getSocket().on('ratingUpdate', handler)
    return () => getSocket().off('ratingUpdate', handler)
  },

  onOpponentLeft(cb: () => void) {
    getSocket().on('opponentLeft', cb)
    return () => getSocket().off('opponentLeft', cb)
  },

  onConnect(cb: () => void) {
    getSocket().on('connect', cb)
    return () => getSocket().off('connect', cb)
  },

  onDisconnect(cb: (reason: string) => void) {
    getSocket().on('disconnect', cb)
    return () => getSocket().off('disconnect', cb)
  },

  sendRematch() {
    getSocket().emit('requestRematch')
  },

  onQueueFull(cb: () => void) {
    getSocket().on('queueFull', cb)
    return () => getSocket().off('queueFull', cb)
  },

  onRematchWaiting(cb: () => void) {
    getSocket().on('rematchWaiting', cb)
    return () => getSocket().off('rematchWaiting', cb)
  },

  onRematchDeclined(cb: () => void) {
    getSocket().on('rematchDeclined', cb)
    return () => getSocket().off('rematchDeclined', cb)
  },

  onReconnecting(cb: (attempt: number) => void) {
    getSocket().io.on('reconnect_attempt', cb)
    return () => getSocket().io.off('reconnect_attempt', cb)
  },

  onReconnectFailed(cb: () => void) {
    getSocket().io.on('reconnect_failed', cb)
    return () => getSocket().io.off('reconnect_failed', cb)
  },

  offAll() {
    socket?.removeAllListeners()
  },
}
