/**
 * One-off script: nulls out documents.content for all documents (or a specific one).
 * Run after a broken-save period to let the room start fresh from an empty doc.
 *
 * Usage:
 *   node scripts/clear-doc-content.mjs            # clears ALL documents
 *   node scripts/clear-doc-content.mjs <docId>    # clears one document
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Manually parse .env.local so we don't need tsx/ts-node
const envPath = resolve(process.cwd(), '.env.local')
try {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
} catch {
  console.error('Could not read .env.local — make sure DATABASE_URL is set in the environment')
}

const { default: postgres } = await import('postgres')

const sql = postgres(process.env.DATABASE_URL)

const docId = process.argv[2] ?? null

if (docId) {
  const result = await sql`UPDATE documents SET content = NULL WHERE id = ${docId}`
  console.log(`Cleared content for document ${docId} (${result.count} row updated)`)
} else {
  const result = await sql`UPDATE documents SET content = NULL`
  console.log(`Cleared content for ALL documents (${result.count} rows updated)`)
}

await sql.end()
console.log('Done. Restart PartyKit — next load will start from an empty doc and write clean state on first edit.')
