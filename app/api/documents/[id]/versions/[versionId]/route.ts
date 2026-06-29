import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/server/auth'
import { getUserPermission, getVersionSnapshot } from '@/server/db/queries'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params
  const session = await auth()
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })
  const perm = await getUserPermission(id, session.user.id)
  if (!perm) return new NextResponse('Forbidden', { status: 403 })

  const snapshot = await getVersionSnapshot(id, versionId)
  if (!snapshot) return new NextResponse(null, { status: 404 })

  return new NextResponse(snapshot.slice(), {
    headers: { 'content-type': 'application/octet-stream' },
  })
}
