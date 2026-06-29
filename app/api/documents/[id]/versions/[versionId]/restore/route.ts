import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { auth } from '@/server/auth'
import { getUserPermission, getVersionSnapshot } from '@/server/db/queries'

function getSecret() {
  return new TextEncoder().encode(process.env.PARTYKIT_SECRET)
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params

  // Gate: editor or owner only
  const session = await auth()
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })
  const perm = await getUserPermission(id, session.user.id)
  if (!perm || perm.role === 'viewer') return new NextResponse('Forbidden', { status: 403 })

  // Fetch snapshot bytes
  const snapshot = await getVersionSnapshot(id, versionId)
  if (!snapshot) return new NextResponse('Version not found', { status: 404 })

  // Mint a room-server token so the room trusts this request
  const token = await new SignJWT({ sub: 'server', doc: id, role: 'room' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30s')
    .sign(getSecret())

  const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? '127.0.0.1:1999'
  const roomRes = await fetch(`http://${partyHost}/party/${id}?action=restore`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
    },
    body: snapshot.slice(),
  })

  if (!roomRes.ok) {
    const text = await roomRes.text().catch(() => '')
    console.error('[restore route] room returned', roomRes.status, text)
    return new NextResponse('Room restore failed', { status: 502 })
  }

  return new NextResponse(null, { status: 204 })
}
