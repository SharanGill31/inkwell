import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { streamText } from 'ai'
import { google } from '@ai-sdk/google'
import { auth } from '@/server/auth'
import { getUserPermission } from '@/server/db/queries'

const MAX_TEXT_CHARS = 10_000

const bodySchema = z.object({
  documentId: z.string().uuid(),
  selectedText: z.string().min(1).max(MAX_TEXT_CHARS),
  action: z.enum(['improve']),
})

const systemPrompts: Record<z.infer<typeof bodySchema>['action'], string> = {
  improve:
    'You are a writing assistant. Improve the provided text to be clearer, more concise, and better written. Return only the improved text with no explanations or commentary.',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return new NextResponse('Bad Request', { status: 400 })

  const { documentId, selectedText, action } = parsed.data

  const perm = await getUserPermission(documentId, session.user.id)
  if (!perm || perm.role === 'viewer') return new NextResponse('Forbidden', { status: 403 })

  const result = streamText({
    model: google('gemini-2.5-flash'),
    system: systemPrompts[action],
    prompt: selectedText,
  })

  return result.toTextStreamResponse()
}
