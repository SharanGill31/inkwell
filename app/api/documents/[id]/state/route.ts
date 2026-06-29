import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { z } from 'zod'
import { loadDocumentState, saveDocumentState } from '@/server/db/queries'

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10 MB

const roomPayloadSchema = z.object({
  sub: z.literal('room'),
  doc: z.string(),
  role: z.literal('room'),
})

async function verifyRoomToken(req: NextRequest, docId: string): Promise<boolean> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false
  try {
    const secret = new TextEncoder().encode(process.env.PARTYKIT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    const parsed = roomPayloadSchema.safeParse(payload)
    return parsed.success && parsed.data.doc === docId
  } catch {
    return false
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!(await verifyRoomToken(req, id))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const content = await loadDocumentState(id)
  if (!content) return new NextResponse(null, { status: 404 })
  console.log(`[state GET] sending ${content.byteLength} B, first4=[${content.slice(0,4)}]`)
  return new NextResponse(content.slice(), {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!(await verifyRoomToken(req, id))) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }
  const body = await req.arrayBuffer()
  console.log(`[state PUT] received ${body.byteLength} B, first4=[${Array.from(new Uint8Array(body).slice(0,4))}]`)
  if (body.byteLength === 0) {
    return new NextResponse('Empty body', { status: 400 })
  }
  if (body.byteLength > MAX_BODY_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }
  await saveDocumentState(id, new Uint8Array(body))
  return new NextResponse(null, { status: 204 })
}
