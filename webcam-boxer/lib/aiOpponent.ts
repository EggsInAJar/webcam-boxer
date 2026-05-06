import type { Difficulty, AIState, PunchType, GameState } from './types'
import { DAMAGE } from './gameEngine'

type DifficultyConfig = {
  idleMin: number
  idleMax: number
  blockChance: number
  blockDuration: [number, number]
  stunDuration: number
  retreatIdleMultiplier: number
}

const CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    idleMin: 2000,
    idleMax: 4000,
    blockChance: 0.15,
    blockDuration: [400, 600],
    stunDuration: 500,
    retreatIdleMultiplier: 2,
  },
  medium: {
    idleMin: 1000,
    idleMax: 2500,
    blockChance: 0.3,
    blockDuration: [500, 800],
    stunDuration: 300,
    retreatIdleMultiplier: 1.5,
  },
  hard: {
    idleMin: 400,
    idleMax: 1200,
    blockChance: 0.5,
    blockDuration: [600, 1000],
    stunDuration: 200,
    retreatIdleMultiplier: 1.2,
  },
}

const PUNCH_WEIGHTS: [PunchType, number][] = [
  ['jab', 0.5],
  ['cross', 0.25],
  ['hook', 0.15],
  ['uppercut', 0.1],
]

export type AIEvent =
  | { type: 'punch'; punch: PunchType }
  | { type: 'blockStart' }
  | { type: 'blockEnd' }

export class AIOpponent {
  private state: AIState = 'IDLE'
  private config: DifficultyConfig
  private timer = 0
  private pendingEvent: AIEvent | null = null

  constructor(difficulty: Difficulty) {
    this.config = CONFIGS[difficulty]
    this.scheduleIdle()
  }

  private scheduleIdle(multiplier = 1) {
    const { idleMin, idleMax } = this.config
    this.timer = (idleMin + Math.random() * (idleMax - idleMin)) * multiplier
    this.state = 'IDLE'
  }

  onPlayerPunch(dmg: number) {
    if (dmg >= 12) {
      this.state = 'STUNNED'
      this.timer = this.config.stunDuration
      return
    }
    if (Math.random() < this.config.blockChance) {
      const [min, max] = this.config.blockDuration
      this.state = 'BLOCKING'
      this.timer = min + Math.random() * (max - min)
      this.pendingEvent = { type: 'blockStart' }
    }
  }

  tick(dtMs: number, gameState: GameState): AIEvent | null {
    if (gameState.phase !== 'fighting') return null

    this.timer -= dtMs
    const event = this.pendingEvent
    this.pendingEvent = null

    if (this.timer > 0) return event

    const retreating = gameState.opponent.hp / 100 < 0.3

    switch (this.state) {
      case 'IDLE':
      case 'RETREATING': {
        const mult = retreating ? this.config.retreatIdleMultiplier : 1
        if (retreating && Math.random() < this.config.blockChance * 1.5) {
          const [min, max] = this.config.blockDuration
          this.state = 'BLOCKING'
          this.timer = min + Math.random() * (max - min)
          return { type: 'blockStart' }
        }
        this.state = 'ATTACKING'
        this.timer = 200
        return null
      }

      case 'ATTACKING': {
        const punch = weightedPick(PUNCH_WEIGHTS)
        this.scheduleIdle(retreating ? this.config.retreatIdleMultiplier : 1)
        return { type: 'punch', punch }
      }

      case 'BLOCKING': {
        this.scheduleIdle()
        return { type: 'blockEnd' }
      }

      case 'STUNNED': {
        this.scheduleIdle()
        return null
      }

      default:
        return null
    }
  }

  reset(difficulty: Difficulty) {
    this.config = CONFIGS[difficulty]
    this.state = 'IDLE'
    this.pendingEvent = null
    this.scheduleIdle()
  }
}

function weightedPick(weights: [PunchType, number][]): PunchType {
  const r = Math.random()
  let cumulative = 0
  for (const [type, w] of weights) {
    cumulative += w
    if (r < cumulative) return type
  }
  return weights[0][0]
}
