import { Server, type Connection, type ConnectionContext } from 'partyserver'
import { jwtVerify, SignJWT } from 'jose'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

// Outer message type constants (match y-partyserver/client provider)
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

// WebSocket ready-state constants (avoids relying on globalThis.WebSocket in Miniflare)
const WS_CONNECTING = 0
const WS_OPEN = 1

// Yjs sync sub-message types (from y-protocols/sync)
const SYNC_STEP1 = 0 // read: client sends its state vector, server replies with missing updates
// SYNC_STEP2 = 1 and UPDATE = 2 are writes — viewers must not send these

type ConnState = { role: 'owner' | 'editor' | 'viewer' }

/** Bindings/env this Durable Object reads at runtime. Must match wrangler.jsonc + party/worker.ts. */
export type RoomEnv = {
  PARTYKIT_SECRET: string
  APP_URL?: string
}

function getRole(conn: Connection): 'owner' | 'editor' | 'viewer' | null {
  return (conn.state as ConnState | null)?.role ?? null
}

function safeSend(conn: Connection, msg: Uint8Array) {
  if (conn.readyState !== WS_CONNECTING && conn.readyState !== WS_OPEN) return
  try { conn.send(msg) } catch {}
}

// Platform adapter: extends partyserver's Server (Cloudflare DurableObject) instead of
// partykit/server's Party.Server. Only the adapter surface changed — the Yjs sync protocol,
// viewer write-gating, debounced Postgres persistence, and non-destructive restore below
// are byte-identical to the PartyKit version.
export default class Document extends Server<RoomEnv> {
  private doc = new Y.Doc()
  private awareness: awarenessProtocol.Awareness
  // conn.id → awareness client IDs controlled by that connection
  private connAwarenessIds = new Map<string, number[]>()
  // Cached room name — set once in onStart() where this.name is safe to read.
  // Every other handler uses this.docId so they never need to re-resolve the name.
  private docId = ''
  // Resolves once the saved Y.Doc state has been fetched from Postgres and applied.
  // onConnect awaits this before syncing so the first client never races an empty doc.
  // Replaced with the real load promise in onStart().
  private loadedPromise: Promise<void> = Promise.resolve()
  // Wall-clock timestamp of the last auto-snapshot (resets on room restart — acceptable).
  private lastAutoSnapshotAt = 0

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env)
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)
  }

  // ─── Postgres helpers ─────────────────────────────────────────────────────

  private async mintRoomToken(docId: string): Promise<string> {
    const rawSecret = this.env.PARTYKIT_SECRET
    if (!rawSecret) throw new Error('PARTYKIT_SECRET not configured')
    const secret = new TextEncoder().encode(rawSecret)
    return new SignJWT({ sub: 'room', doc: docId, role: 'room' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30s')
      .sign(secret)
  }

  private appUrl(): string {
    return this.env.APP_URL ?? 'http://localhost:3000'
  }

  private async loadFromPostgres(docId: string): Promise<void> {
    try {
      const token = await this.mintRoomToken(docId)
      const url = `${this.appUrl()}/api/documents/${docId}/state`
      console.log(`[Document] loadFromPostgres: GET ${url}`)
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        // Never follow auth redirects. Without this, a 302→/login returns 200 HTML
        // which passes res.ok and corrupts Y.applyUpdate with an HTML body.
        redirect: 'manual',
      })
      const ct = res.headers.get('content-type') ?? ''
      console.log(`[Document] loadFromPostgres: status=${res.status}, content-type=${ct}`)
      if (res.status === 404) return // no saved state yet — start with empty doc
      if (!res.ok) {
        console.error(`[Document] loadFromPostgres: non-ok ${res.status}, skipping apply`)
        return
      }
      if (!ct.includes('octet-stream')) {
        console.error(`[Document] loadFromPostgres: unexpected content-type "${ct}", skipping apply`)
        return
      }
      const buf = await res.arrayBuffer()
      const u8 = new Uint8Array(buf)
      console.log(`[Document] loadFromPostgres: received ${buf.byteLength} B, first4=[${u8.slice(0,4)}]`)
      if (buf.byteLength > 2) Y.applyUpdate(this.doc, u8)
    } catch (err) {
      console.error('[Document] loadFromPostgres error:', err)
    }
  }

  private async saveToPostgres(docId: string): Promise<void> {
    try {
      const token = await this.mintRoomToken(docId)
      const update = Y.encodeStateAsUpdate(this.doc).slice()
      console.log(`[Document] saveToPostgres: encoding ${update.byteLength} B, first4=[${update.slice(0,4)}]`)
      const res = await fetch(`${this.appUrl()}/api/documents/${docId}/state`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
        },
        body: update,
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      console.log(`[Document] saveToPostgres: ok (${update.byteLength} B)`)
    } catch (err) {
      console.error('[Document] saveToPostgres error:', err)
    }
  }

  // Fires when a scheduled alarm triggers (Durable Object alarm API).
  // setAlarm is called on every doc update in onStart; each call resets the
  // 2-second window, so this only fires after 2 s of editing silence.
  async onAlarm() {
    // this.name is available inside onAlarm in partyserver; the storage fallback covers
    // the rare case where onStart hasn't populated this.docId yet.
    const docId = this.docId || ((await this.ctx.storage.get<string>('docId')) ?? '')
    if (!docId) { console.error('[Document] onAlarm: docId missing from storage'); return }

    await this.saveToPostgres(docId)
    // Auto-snapshot: at most once every 5 minutes. saveToPostgres() has already written
    // documents.content, so the snapshot route will read a fresh state.
    // Isolated in its own try/catch so any unforeseen error here cannot escape onAlarm()
    // and suppress future alarms in the Durable Object runtime.
    try {
      if (Date.now() - this.lastAutoSnapshotAt > 5 * 60 * 1000) {
        this.lastAutoSnapshotAt = Date.now()
        await this.postAutoSnapshot(docId)
      }
    } catch (err) {
      console.error('[Document] alarm: snapshot block error:', err)
    }
  }

  private async postAutoSnapshot(docId: string): Promise<void> {
    try {
      const token = await this.mintRoomToken(docId)
      const res = await fetch(`${this.appUrl()}/api/documents/${docId}/versions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Auto-snapshot failed: ${res.status}`)
    } catch (err) {
      console.error('[Document] postAutoSnapshot error:', err)
    }
  }

  // ─── Restore helpers ──────────────────────────────────────────────────────

  private applyRestore(snapshotBytes: Uint8Array): void {
    const tempDoc = new Y.Doc()
    Y.applyUpdate(tempDoc, snapshotBytes)

    this.doc.transact(() => {
      // Restore title
      const liveTitle = this.doc.getText('title')
      liveTitle.delete(0, liveTitle.length)
      liveTitle.insert(0, tempDoc.getText('title').toString())

      // Restore editor content: clear all current nodes, clone snapshot nodes
      const liveXml = this.doc.getXmlFragment('default')
      liveXml.delete(0, liveXml.length)
      this.cloneXml(tempDoc.getXmlFragment('default'), liveXml)
    })
  }

  private cloneXml(
    src: Y.XmlFragment | Y.XmlElement,
    dst: Y.XmlFragment | Y.XmlElement,
  ): void {
    const items: (Y.XmlElement | Y.XmlText)[] = []
    for (const child of src.toArray()) {
      if (child instanceof Y.XmlText) {
        const t = new Y.XmlText()
        t.applyDelta(child.toDelta())
        items.push(t)
      } else if (child instanceof Y.XmlElement) {
        const el = new Y.XmlElement(child.nodeName)
        for (const [k, v] of Object.entries(child.getAttributes()))
          el.setAttribute(k, v ?? '')
        this.cloneXml(child, el)
        items.push(el)
      }
    }
    if (items.length > 0) dst.insert(0, items)
  }

  // ─── HTTP handler (non-WebSocket requests to the room) ───────────────────
  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (req.method === 'POST' && action === 'restore') {
      // Verify room-server token
      const header = req.headers.get('authorization')
      const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
      if (!token) return new Response('Unauthorized', { status: 401 })

      try {
        const rawSecret = this.env.PARTYKIT_SECRET
        if (!rawSecret) return new Response('Unauthorized', { status: 401 })
        const secret = new TextEncoder().encode(rawSecret)
        const { payload } = await jwtVerify(token, secret)
        if (payload.role !== 'room' || payload.doc !== this.docId)
          return new Response('Forbidden', { status: 403 })
      } catch {
        return new Response('Unauthorized', { status: 401 })
      }

      const buf = await req.arrayBuffer()
      if (buf.byteLength === 0) return new Response('Empty body', { status: 400 })

      await this.loadedPromise
      this.applyRestore(new Uint8Array(buf))

      return new Response(null, { status: 204 })
    }

    return new Response('Not Found', { status: 404 })
  }

  // NOTE: the edge JWT gate (PartyKit's static onBeforeConnect) now lives in
  // party/worker.ts, passed to routePartykitRequest(). It rejects unknown callers
  // before the Durable Object is touched.

  // ─── Durable Object layer ─────────────────────────────────────────────────
  // Verify the token a second time (defence in depth) and store the role so
  // onMessage can enforce read-only without re-parsing the token on every message.
  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const token = new URL(ctx.request.url).searchParams.get('token') ?? ''
    const rawSecret = this.env.PARTYKIT_SECRET
    if (!rawSecret) { conn.close(4500, 'Server misconfigured'); return }

    try {
      const secret = new TextEncoder().encode(rawSecret)
      const { payload } = await jwtVerify(token, secret)
      if (payload.doc !== this.docId) { conn.close(4003, 'Forbidden'); return }
      conn.setState({ role: payload.role as ConnState['role'] })
    } catch (err) {
      console.error('[onConnect] auth error:', err)
      conn.close(4001, 'Unauthorized')
      return
    }

    // Ensure saved state is applied before syncing with this client.
    // The promise is cached — subsequent connections await the same resolved promise.
    await this.loadedPromise

    // Sync step 1: send our state vector so the client can send us what we're missing
    const syncEncoder = encoding.createEncoder()
    encoding.writeVarUint(syncEncoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(syncEncoder, this.doc)
    safeSend(conn, encoding.toUint8Array(syncEncoder))

    // Send all current awareness states to the newly connected client
    const awarenessStates = this.awareness.getStates()
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder()
      encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS)
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...awarenessStates.keys()]),
      )
      safeSend(conn, encoding.toUint8Array(awarenessEncoder))
    }
  }

  onStart() {
    // this.name is safe to read here. Cache it so every other handler uses this.docId.
    this.docId = this.name
    this.ctx.storage.put('docId', this.docId).catch(console.error)
    this.loadedPromise = this.loadFromPostgres(this.docId)

    // Broadcast Y.Doc updates to all connections and schedule a debounced Postgres save.
    this.doc.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      const msg = encoding.toUint8Array(encoder)
      for (const conn of this.getConnections()) safeSend(conn, msg)
      // Reset the alarm window on every edit — fires saveToPostgres after 2 s of silence.
      this.ctx.storage.setAlarm(Date.now() + 2000).catch(console.error)
      console.log('[Document] alarm scheduled (+2s)')
    })

    // Awareness event handler:
    //   - connection-initiated update → track IDs only (onMessage does the relay)
    //   - server-initiated update (e.g. removeAwarenessStates on close) → broadcast
    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const isConnectionOrigin =
          origin !== null &&
          typeof origin === 'object' &&
          'id' in (origin as object)

        if (isConnectionOrigin) {
          const connId = (origin as Connection).id
          const ids = new Set(this.connAwarenessIds.get(connId) ?? [])
          for (const id of added) ids.add(id)
          for (const id of removed) ids.delete(id)
          this.connAwarenessIds.set(connId, [...ids])
        } else {
          // Server-initiated (close cleanup etc.) — broadcast to all
          const changedClients = [...added, ...updated, ...removed]
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
          encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
          )
          const msg = encoding.toUint8Array(encoder)
          for (const conn of this.getConnections()) safeSend(conn, msg)
        }
      },
    )
  }

  // NOTE: partyserver calls onMessage(connection, message) — connection first.
  // (PartyKit used onMessage(message, sender); only the parameter order changed.)
  onMessage(sender: Connection, message: string | ArrayBuffer | ArrayBufferView) {
    if (typeof message === 'string') return

    const data =
      message instanceof Uint8Array
        ? message
        : new Uint8Array(
            message instanceof ArrayBuffer
              ? message
              : (message as ArrayBufferView).buffer,
          )

    try {
      const decoder = decoding.createDecoder(data)
      const messageType = decoding.readVarUint(decoder)

      switch (messageType) {
        case MESSAGE_SYNC: {
          // ── Viewer write guard ──────────────────────────────────────────
          // Peek at the Yjs sync sub-type without advancing the decoder.
          // Viewers may send step1 (read: we reply with our state so they
          // see the doc) but must not send step2 or update (writes).
          if (getRole(sender) === 'viewer') {
            const savedPos = decoder.pos
            const subType = decoding.readVarUint(decoder)
            decoder.pos = savedPos          // restore so readSyncMessage re-reads it
            if (subType !== SYNC_STEP1) break // drop step2=1 and update=2
          }
          // ───────────────────────────────────────────────────────────────
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_SYNC)
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, sender)
          if (encoding.length(encoder) > 1) safeSend(sender, encoding.toUint8Array(encoder))
          break
        }
        case MESSAGE_AWARENESS: {
          const awarenessData = decoding.readVarUint8Array(decoder)
          // Viewers may send awareness (presence) — no role check here
          awarenessProtocol.applyAwarenessUpdate(this.awareness, awarenessData, sender)
          // Relay raw bytes to all clients (including sender for consistency)
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
          encoding.writeVarUint8Array(encoder, awarenessData)
          const msg = encoding.toUint8Array(encoder)
          for (const conn of this.getConnections()) safeSend(conn, msg)
          break
        }
      }
    } catch (err) {
      console.error('[Document] onMessage error:', err)
    }
  }

  onClose(conn: Connection) {
    const ids = this.connAwarenessIds.get(conn.id) ?? []
    if (ids.length > 0) {
      // Fires awareness 'update' with origin=null → event handler broadcasts the removal
      awarenessProtocol.removeAwarenessStates(this.awareness, ids, null)
    }
    this.connAwarenessIds.delete(conn.id)

    // When the last connection closes, save immediately and cancel the pending alarm.
    // This ensures state is written to Postgres before the Durable Object is evicted,
    // even if the 2-second alarm window hasn't elapsed yet.
    if ([...this.getConnections()].length === 0) {
      this.ctx.storage.deleteAlarm().catch(console.error)
      this.saveToPostgres(this.docId).catch(console.error)
    }
  }
}
