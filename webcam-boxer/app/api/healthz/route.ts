export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    status: 'ok',
    version: process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev',
    ts: new Date().toISOString(),
  })
}
