import { z } from 'zod'

const uuidSchema = z.string().uuid()

export const punchSchema = z.object({
  room: uuidSchema,
  punch: z.enum(['jab', 'cross', 'hook', 'uppercut', 'block']),
})

export const handshakeAuthSchema = z.union([
  z.null(),
  z.object({
    guestId: uuidSchema,
    token: z.string().min(1),
  }),
])

export function parsePunch(raw) {
  return punchSchema.safeParse(raw)
}

export function parseHandshakeAuth(raw) {
  return handshakeAuthSchema.safeParse(raw ?? null)
}
