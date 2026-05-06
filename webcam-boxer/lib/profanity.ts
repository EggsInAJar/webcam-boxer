const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'cock', 'dick',
  'nigger', 'nigga', 'faggot', 'fag', 'slut', 'whore',
  'bastard', 'asshole', 'piss', 'crap',
]

export function isProfane(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  return BLOCKED.some((word) => normalized.includes(word))
}
