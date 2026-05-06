# Webcam Boxer

A browser-based 1v1 boxing game where your webcam is the controller. Punch, block, and dodge using your real body movements, detected in-browser via MediaPipe.

## Architecture

```
VirtualBoxing/
├── webcam-boxer/   # Next.js 16 frontend (Vercel)
└── server/         # Node.js Socket.io game server (Railway)
```

### Frontend (`webcam-boxer/`)
- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **MediaPipe** `@mediapipe/tasks-vision` — in-browser pose detection via `PoseLandmarker`
- **Supabase** — leaderboard reads (anon key), profile writes (service key in API routes)
- **Socket.io client** — real-time match communication
- **Vercel Analytics** — match start/end tracking

### Server (`server/`)
- **Node.js 20+** with ESM
- **Socket.io 4** — WebSocket relay + game authority
- **Supabase** (service role) — player records, match history, ELO updates
- **Pino** — structured logging with token redaction
- **Zod** — all inbound socket payload validation

## Game Flow

1. Player visits `/online`, fetches a guest identity (UUID + HMAC token)
2. Server queues players, pairs them into a room, emits `matchFound`
3. 3-second countdown → calibration → fight
4. Server is authoritative: tracks HP, runs the round timer, emits `roundResult` / `matchResult`
5. Client applies punches optimistically for instant feel; HP reconciled at round boundaries
6. Match ends → ELO updated atomically via Supabase RPC → `ratingUpdate` emitted per-player

## ELO System

- Starting rating: **1200**
- K-factor: **32**
- Rating floor: **100**
- Formula: `expected = 1 / (1 + 10^((rB-rA)/400))`
- Updated atomically via `record_match` Postgres RPC (insert match + update both players in one transaction)

## Punch Detection

| Move | Detection |
|------|-----------|
| Jab | Fast forward extension of the non-dominant wrist |
| Cross | Fast forward extension of the dominant wrist |
| Hook | Lateral wrist sweep across the body |
| Uppercut | Upward wrist trajectory |
| Block | Both wrists raised above shoulders |

Detection runs at 60fps using `PoseLandmarker` in `VIDEO` mode on the CPU delegate.

## Setup

### Prerequisites
- Node.js 20+
- A Supabase project
- (Optional) A Railway account for the server

### 1. Database

Run the migrations in order against your Supabase project:

```bash
supabase db push
# or apply manually:
psql $DATABASE_URL < webcam-boxer/supabase/migrations/0001_init.sql
psql $DATABASE_URL < webcam-boxer/supabase/migrations/0002_username_unique.sql
psql $DATABASE_URL < webcam-boxer/supabase/migrations/0003_record_match.sql
```

### 2. Server

```bash
cd server
cp .env.example .env   # fill in values
npm install
npm start
```

**Server environment variables:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `IDENTITY_SIGNING_SECRET` | 32+ char random secret for HMAC tokens |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend origins |
| `PORT` | (optional) Port to listen on, defaults to `3001` |

Generate a signing secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Frontend

```bash
cd webcam-boxer
cp .env.local.example .env.local   # fill in values
npm install   # also runs postinstall: copies MediaPipe assets to public/
npm run dev
```

**Frontend environment variables:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_SOCKET_URL` | URL of the game server (e.g. `https://your-app.railway.app`) |
| `IDENTITY_SIGNING_SECRET` | Same secret as the server (used in Next.js API routes) |

## Development

```bash
# Server (auto-reload)
cd server && npm run dev

# Frontend
cd webcam-boxer && npm run dev

# Tests
cd server && npm test
cd webcam-boxer && npm test
```

The test page at `/test` lets you verify MediaPipe is working before going online.

## Production Deployment

### Server → Railway

1. Create a new Railway project, point it at `server/`
2. Set all server environment variables in Railway's dashboard
3. Railway auto-detects `npm start` from `package.json`

### Frontend → Vercel

1. Import `webcam-boxer/` into Vercel
2. Set all frontend environment variables in Vercel's dashboard
3. Set `ALLOWED_ORIGINS` on the server to include your Vercel deployment URL

### MediaPipe Assets

`npm install` copies WASM files from `node_modules` and downloads the pose landmarker model (~5.5 MB) into `public/mediapipe/`. These are served from your own domain with a CDN fallback. The `postinstall` script handles this automatically.

## Security

- Guest identities use HMAC-SHA256 tokens with 7-day TTL
- All socket payloads validated with Zod schemas
- Rate limiting: 10 identity requests/min per IP, 30 punches/sec per socket
- CORS restricted to `ALLOWED_ORIGINS`
- CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` on all responses
- Usernames filtered for profanity and checked for uniqueness before saving

## Project Structure

```
webcam-boxer/
├── app/
│   ├── api/
│   │   ├── leaderboard/   # GET — top 100 players
│   │   ├── profile/       # GET/PATCH — player profile
│   │   └── username-check/ # GET — availability check
│   ├── leaderboard/       # Leaderboard page
│   ├── online/            # Online 1v1 page
│   └── solo/              # Solo vs AI page
├── components/            # React components
├── lib/                   # Client utilities
│   ├── gameEngine.ts      # Client-side game logic
│   ├── identity.ts        # Guest identity management
│   ├── mediapipe.ts       # PoseLandmarker wrapper
│   ├── profanity.ts       # Username filter
│   ├── punchDetector.ts   # Punch/block detection
│   └── socketClient.ts    # Socket.io client wrapper
└── supabase/migrations/   # Database migrations

server/
├── gameRoom.js            # Room lifecycle, HP authority
├── matchmaking.js         # Queue and pairing
├── rematch.js             # Rematch slot management
└── lib/
    ├── constants.js       # Damage values, round config
    ├── db.js              # Supabase + ELO persistence
    ├── elo.js             # ELO math (pure functions)
    ├── env.js             # Environment validation
    ├── gameState.js       # Pure game state functions
    ├── identity.js        # Token mint/verify
    ├── rateLimit.js       # Sliding-window rate limiter
    └── validate.js        # Zod schemas
```
