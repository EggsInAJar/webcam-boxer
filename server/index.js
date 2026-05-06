import 'dotenv/config'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { loadEnv } from './lib/env.js'
import { logger } from './lib/logger.js'
import { getSupabase } from './lib/supabase.js'
import { mintToken, verifyToken, findOrCreatePlayer } from './lib/identity.js'
import { handleFindMatch, removeFromQueue } from './matchmaking.js'
import { createRoom, handlePunch, handleDisconnect, getRoomCount, handlePlayerReady } from './gameRoom.js'
import { handleRequestRematch } from './rematch.js'
import { RateLimiter } from './lib/rateLimit.js'

const cfg = loadEnv()

// Rate limiters
const identityRl = new RateLimiter(10, 60_000)   // 10 req/min per IP
const findMatchRl = new RateLimiter(5, 60_000)   // 5 findMatch/min per socket
const punchRl = new RateLimiter(30, 1_000)       // 30 punches/sec per socket
const rematchRl = new RateLimiter(3, 10_000)     // 3 rematch requests per 10s per socket

// ── HTTP server (health + identity REST endpoints) ─────────────────────────

const BODY_LIMIT = 4096 // bytes

async function readBody(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > BODY_LIMIT) return null
  }
  return body
}

const httpServer = createServer(async (req, res) => {
  // Reflect the request origin only if it's in the allowlist
  const reqOrigin = req.headers['origin']
  if (reqOrigin && cfg.allowedOrigins.includes(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin)
    res.setHeader('Vary', 'Origin')
  } else if (!reqOrigin) {
    // Same-origin or non-browser (e.g. health check) — allow
    res.setHeader('Access-Control-Allow-Origin', cfg.allowedOrigins[0] ?? '*')
  }
  // If origin is set but not in allowlist, send no ACAO header (browser blocks it)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/healthz' && req.method === 'GET') {
    let dbOk = false
    try {
      const { error } = await getSupabase().from('players').select('id').limit(1)
      dbOk = !error
    } catch { /* db unreachable */ }

    const body = JSON.stringify({
      status: dbOk ? 'ok' : 'degraded',
      uptime: process.uptime(),
      activeMatches: getRoomCount(),
      db: dbOk,
    })
    res.writeHead(dbOk ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(body)
    return
  }

  if (req.url === '/v1/identity' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown'
    if (!identityRl.check(ip).allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      res.end(JSON.stringify({ error: 'Too many requests' }))
      return
    }
    try {
      const raw = await readBody(req)
      if (raw === null) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request too large' }))
        return
      }
      const { guestId } = JSON.parse(raw || '{}')

      const player = await findOrCreatePlayer(getSupabase(), guestId ?? null)
      const token = mintToken(player.id, cfg.signingSecret)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        guestId: player.id,
        token,
        rating: player.rating,
        username: player.username ?? null,
      }))
    } catch (err) {
      logger.error({ err }, 'identity endpoint error')
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
    return
  }

  if (req.url === '/v1/verify' && req.method === 'POST') {
    try {
      const raw = await readBody(req)
      if (raw === null) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request too large' }))
        return
      }
      const { guestId, token } = JSON.parse(raw || '{}')

      if (!guestId || !token || !verifyToken(guestId, token, cfg.signingSecret)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid credentials' }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ valid: true }))
    } catch (err) {
      logger.error({ err }, 'verify endpoint error')
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
    return
  }

  res.writeHead(404)
  res.end()
})

// ── Socket.io ──────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: cfg.allowedOrigins,
    methods: ['GET', 'POST'],
  },
})

// Auth middleware — attach verified identity to socket.data
io.use(async (socket, next) => {
  const { guestId, token } = socket.handshake.auth ?? {}
  if (guestId && token && verifyToken(guestId, token, cfg.signingSecret)) {
    socket.data.guestId = guestId
    // Fetch rating + username so matchmaking can expose them to the opponent
    try {
      const { data } = await getSupabase()
        .from('players')
        .select('rating, username')
        .eq('id', guestId)
        .single()
      if (data) {
        socket.data.rating = data.rating
        socket.data.username = data.username ?? null
      }
    } catch { /* non-fatal — matchmaking still works without these */ }
  }
  // Allow unauthenticated connections (no ELO tracking)
  next()
})

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id.slice(0, 6), guestId: socket.data.guestId }, 'connect')

  socket.on('findMatch', () => {
    if (!findMatchRl.check(socket.id).allowed) return
    try {
      handleFindMatch(socket, io)
    } catch (err) {
      logger.error({ err }, 'findMatch error')
    }
  })

  socket.on('ready', () => {
    try {
      handlePlayerReady(socket)
    } catch (err) {
      logger.error({ err }, 'ready error')
    }
  })

  socket.on('punch', (payload) => {
    if (!punchRl.check(socket.id).allowed) return
    try {
      handlePunch(socket, payload)
    } catch (err) {
      logger.error({ err }, 'punch error')
    }
  })

  socket.on('requestRematch', () => {
    if (!rematchRl.check(socket.id).allowed) return
    try {
      const result = handleRequestRematch(socket)
      if (result.matched) {
        const { leftSocket, rightSocket } = result
        const roomId = createRoom(io, leftSocket, rightSocket)
        leftSocket.emit('matchFound', {
          room: roomId,
          side: 'left',
          opponentUsername: rightSocket.data.username ?? null,
          opponentRating: rightSocket.data.rating ?? 1200,
        })
        rightSocket.emit('matchFound', {
          room: roomId,
          side: 'right',
          opponentUsername: leftSocket.data.username ?? null,
          opponentRating: leftSocket.data.rating ?? 1200,
        })
        logger.info({ roomId: roomId.slice(0, 8) }, 'rematch room created')
      }
    } catch (err) {
      logger.error({ err }, 'requestRematch error')
    }
  })

  socket.on('disconnect', () => {
    try {
      handleDisconnect(socket)
    } catch (err) {
      logger.error({ err }, 'disconnect handler error')
    }
    removeFromQueue(socket.id)
    findMatchRl.remove(socket.id)
    punchRl.remove(socket.id)
    rematchRl.remove(socket.id)
    logger.info({ socketId: socket.id.slice(0, 6) }, 'disconnect')
  })
})

// ── Graceful shutdown ──────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down')
  io.emit('serverShutdown')
  httpServer.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
})

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'unhandledRejection')
  process.exit(1)
})

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException')
  process.exit(1)
})

httpServer.listen(cfg.port, () => {
  logger.info({ port: cfg.port }, 'Webcam Boxer server started')
})
