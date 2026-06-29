import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { auth } from '@/server/auth'
import {
  getUserPermission,
  loadDocumentState,
  listVersions,
  createVersion,
} from '@/server/db/queries'

const createBodySchema = z.object({
  label: z.string().max(200).optional(),
})

function getSecret() {
  return new TextEncoder().encode(process.env.PARTYKIT_SECRET)
}

async function verifyRoomToken(req: NextRequest, docId: string): Promise<boolean> {
  const header = req.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload.role === 'room' && payload.doc === docId
  } catch {
    return false
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })
  const perm = await getUserPermission(id, session.user.id)
  if (!perm) return new NextResponse('Forbidden', { status: 403 })

  const versions = await listVersions(id)
  return NextResponse.json(versions)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let label: string

  const isRoom = await verifyRoomToken(req, id)

  if (isRoom) {
    label = `Auto – ${new Date().toISOString()}`
  } else {
    const session = await auth()
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })
    const perm = await getUserPermission(id, session.user.id)
    if (!perm || perm.role === 'viewer') return new NextResponse('Forbidden', { status: 403 })

    const rawBody = await req.json().catch(() => ({}))
    const parsed = createBodySchema.safeParse(rawBody)
    const userLabel = parsed.success ? (parsed.data.label ?? '') : ''
    label = userLabel.trim() || `Manual – ${new Date().toISOString()}`
  }

  const snapshot = await loadDocumentState(id)
  if (!snapshot) return new NextResponse('No content saved yet', { status: 422 })

  const version = await createVersion(id, snapshot, label)
  return NextResponse.json(version, { status: 201 })
}
