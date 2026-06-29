import { pgTable, text, timestamp, uuid, pgEnum, customType } from 'drizzle-orm/pg-core'

// Pure conversion functions exported so they can be unit-tested independently.
// Runtime behaviour is identical to the inline versions they replaced.

export function byteaToDriver(val: Uint8Array): Buffer {
  return Buffer.from(val)
}

export function byteaFromDriver(val: Buffer): Uint8Array {
  // postgres.js text protocol returns bytea as a '\x<hex>' string, not a Buffer.
  // Cast through unknown because driverData: Buffer makes the string branch 'never'.
  const raw = val as unknown
  if (typeof raw === 'string') {
    const hex = raw.startsWith('\\x') ? raw.slice(2) : raw
    const out = new Uint8Array(Buffer.from(hex, 'hex'))
    console.log(`[bytea fromDriver] string path: hexLen=${hex.length}, decoded=${out.byteLength} B`)
    return out
  }
  const out = new Uint8Array(val as Buffer)
  console.log(`[bytea fromDriver] buffer path: bufLen=${(val as Buffer).length}, out=${out.byteLength} B`)
  return out
}

// drizzle-orm/pg-core doesn't ship a bytea helper; define one via customType
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
  toDriver: byteaToDriver,
  fromDriver: byteaFromDriver,
})

export const roleEnum = pgEnum('role', ['owner', 'editor', 'viewer'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull().default('Untitled'),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: bytea('content'), // serialised Y.Doc state
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const documentPermissions = pgTable('document_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
})

export const documentVersions = pgTable('document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  snapshot: bytea('snapshot').notNull(), // Y.Doc snapshot bytes
  label: text('label'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
