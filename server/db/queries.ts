import 'server-only'
import { db } from '@/server/db'
import { users, documents, documentPermissions, documentVersions } from '@/server/db/schema'
import { eq, and, desc } from 'drizzle-orm'

// Called by the room's state API route — no user permission check needed because
// the route already verified the signed room JWT.
export async function loadDocumentState(docId: string): Promise<Uint8Array | null> {
  const rows = await db
    .select({ content: documents.content })
    .from(documents)
    .where(eq(documents.id, docId))
    .limit(1)
  return rows[0]?.content ?? null
}

export async function saveDocumentState(docId: string, content: Uint8Array): Promise<void> {
  await db
    .update(documents)
    .set({ content, updatedAt: new Date() })
    .where(eq(documents.id, docId))
}

export async function getUserPermission(docId: string, userId: string) {
  const rows = await db
    .select({ role: documentPermissions.role })
    .from(documentPermissions)
    .where(and(eq(documentPermissions.documentId, docId), eq(documentPermissions.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export function listVersions(docId: string) {
  return db
    .select({
      id: documentVersions.id,
      label: documentVersions.label,
      createdAt: documentVersions.createdAt,
    })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, docId))
    .orderBy(desc(documentVersions.createdAt))
}

export async function getVersionSnapshot(docId: string, versionId: string): Promise<Uint8Array | null> {
  const rows = await db
    .select({ snapshot: documentVersions.snapshot })
    .from(documentVersions)
    .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, docId)))
    .limit(1)
  return rows[0]?.snapshot ?? null
}

export async function createVersion(
  docId: string,
  snapshot: Uint8Array,
  label: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(documentVersions)
    .values({ documentId: docId, snapshot, label })
    .returning({ id: documentVersions.id })
  return row
}

export function getUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) })
}

export function getDocumentsByUser(userId: string) {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      role: documentPermissions.role,
    })
    .from(documents)
    .innerJoin(documentPermissions, eq(documentPermissions.documentId, documents.id))
    .where(eq(documentPermissions.userId, userId))
    .orderBy(documents.updatedAt)
}

export async function getDocumentForUser(docId: string, userId: string) {
  const rows = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .innerJoin(documentPermissions, eq(documentPermissions.documentId, documents.id))
    .where(and(eq(documents.id, docId), eq(documentPermissions.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getDocumentWithContent(docId: string, userId: string) {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      content: documents.content,
      role: documentPermissions.role,
    })
    .from(documents)
    .innerJoin(documentPermissions, eq(documentPermissions.documentId, documents.id))
    .where(and(eq(documents.id, docId), eq(documentPermissions.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}
