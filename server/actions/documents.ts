'use server'
import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { SignJWT } from 'jose'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { documents, documentPermissions } from '@/server/db/schema'

export async function createDocument() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const [doc] = await db
    .insert(documents)
    .values({ ownerId: session.user.id })
    .returning({ id: documents.id })
  await db.insert(documentPermissions).values({
    documentId: doc.id,
    userId: session.user.id,
    role: 'owner',
  })
  redirect(`/documents/${doc.id}`)
}

async function requireEditorPermission(documentId: string, userId: string) {
  const rows = await db
    .select({ role: documentPermissions.role })
    .from(documentPermissions)
    .where(
      and(
        eq(documentPermissions.documentId, documentId),
        eq(documentPermissions.userId, userId),
      ),
    )
    .limit(1)
  const perm = rows[0]
  if (!perm || perm.role === 'viewer') throw new Error('Forbidden')
}

export async function saveDocumentContent(id: string, state: Uint8Array) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  await requireEditorPermission(id, session.user.id)
  await db
    .update(documents)
    .set({ content: state, updatedAt: new Date() })
    .where(eq(documents.id, id))
}

export async function saveDocumentTitle(id: string, title: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  await requireEditorPermission(id, session.user.id)
  await db
    .update(documents)
    .set({ title: title.trim() || 'Untitled', updatedAt: new Date() })
    .where(eq(documents.id, id))
}

// Mints a short-lived room token so the PartyKit room can verify who is connecting
// and what role they hold — without the room needing a DB connection.
export async function getRoomToken(documentId: string): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const rows = await db
    .select({ role: documentPermissions.role })
    .from(documentPermissions)
    .where(
      and(
        eq(documentPermissions.documentId, documentId),
        eq(documentPermissions.userId, session.user.id),
      ),
    )
    .limit(1)

  const perm = rows[0]
  if (!perm) throw new Error('Forbidden')

  const secret = new TextEncoder().encode(process.env.PARTYKIT_SECRET)
  return new SignJWT({ sub: session.user.id, doc: documentId, role: perm.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(secret)
}
