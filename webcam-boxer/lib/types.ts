export type PunchType = 'jab' | 'cross' | 'hook' | 'uppercut' | 'block'

export type GamePhase =
  | 'calibrating'
  | 'countdown'
  | 'fighting'
  | 'roundEnd'
  | 'gameOver'

export type FighterState = {
  hp: number
  blocking: boolean
  lastPunch: PunchType | null
  lastPunchTime: number
  roundsWon: number
}

export type GameState = {
  player: FighterState
  opponent: FighterState
  round: number
  timer: number
  phase: GamePhase
  lastHitText: string | null
  lastHitTime: number
  lastHitDamage: number
  hitTarget: 'player' | 'opponent' | null
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export type AIState = 'IDLE' | 'ATTACKING' | 'BLOCKING' | 'RETREATING' | 'STUNNED'

export type Player = {
  id: string
  username: string | null
  rating: number
  games_played: number
  wins: number
  losses: number
  draws: number
}

export type RatingDelta = {
  before: number
  after: number
  delta: number
}
