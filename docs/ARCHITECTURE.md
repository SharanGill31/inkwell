# Inkwell — Architecture Guide

Inkwell is a **local-first, collaborative document editor** with offline support, deterministic conflict resolution via CRDTs (Yjs), and full version history. This guide covers the system topology, data flows, security model, and key implementation patterns.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [System Topology](#system-topology)
3. [Directory Structure](#directory-structure)
4. [Database Schema](#database-schema)
5. [Authentication & Room Token Flow](#authentication--room-token-flow)
6. [Local-First Data Layer](#local-first-data-layer)
7. [Realtime Sync Architecture](#realtime-sync-architecture)
8. [Persistence & Alarm Flow](#persistence--alarm-flow)
9. [Version History & Restore](#version-history--restore)
10. [AI Integration](#ai-integration)
11. [API Routes](#api-routes)
12. [Environment Variables](#environment-variables)
13. [Security Model](#security-model)

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| UI Framework | Next.js 16 (App Router, React 19, TypeScript) | Pages, SSR, Server Actions, API Routes |
| Styling | Tailwind CSS + shadcn/ui | Component library |
| Rich Text Editor | Tiptap (y-prosemirror, ProseMirror) | Document editing surface |
| CRDT Engine | Yjs | Conflict-free collaborative state |
| Offline Storage | y-indexeddb | Per-device local persistence |
| Realtime Transport | PartyKit / y-partyserver (Cloudflare Durable Objects) | One room per document; WebSocket sync |
| Database | PostgreSQL (Neon) + Drizzle ORM | System of record; binary Y.Doc state |
| Authentication | Auth.js (NextAuth v5), JWT strategy | Session auth; HS256 room tokens via jose |
| AI | Vercel AI SDK + Google Gemini 2.5 Flash | Streaming text improvement |

---

## System Topology

```mermaid
graph TD
    subgraph Browser
        IDB[(IndexedDB\ny-indexeddb)]
        YDOC[Y.Doc\nCRDT in-memory]
        TIPTAP[Tiptap Editor\ny-prosemirror]
        HOOKS[useYDoc\nusePartyProvider]
    end

    subgraph NextJS["Next.js 16 — Vercel"]
        SSR[SSR Page\n/documents/id]
        SA[Server Actions\ngetRoomToken\nsaveDocumentTitle]
        API_STATE[API /state\nGET · PUT]
        API_VER[API /versions\nGET · POST]
        API_RESTORE[API /versions/id/restore\nPOST]
        API_AI[API /ai\nPOST stream]
        NEXTAUTH[NextAuth\n/api/auth]
    end

    subgraph Cloudflare["Cloudflare — PartyKit"]
        WORKER[Worker Edge\nonBeforeConnect JWT gate]
        DO[Durable Object\nDocument class\none per documentId]
    end

    subgraph PG["Neon PostgreSQL"]
        USERS[(users)]
        DOCS[(documents\nbytea content)]
        PERMS[(document_permissions)]
        VERSIONS[(document_versions\nbytea snapshot)]
    end

    subgraph Gemini["Google AI"]
        GEM[Gemini 2.5 Flash]
    end

    Browser -- "1. GET /documents/id SSR" --> SSR
    SSR -- "JOIN documents + permissions" --> DOCS
    SSR -- "initialContent: Uint8Array" --> HOOKS

    HOOKS -- "IndexeddbPersistence" --> IDB
    HOOKS -- "Y.applyUpdate seed" --> YDOC
    YDOC <--> TIPTAP

    HOOKS -- "getRoomToken() Server Action" --> SA
    SA -- "SELECT role" --> PERMS
    SA -- "SignJWT HS256 5min" --> HOOKS

    HOOKS -- "WSS ?token=JWT" --> WORKER
    WORKER -- "jwtVerify edge gate" --> DO
    DO -- "onConnect: jwtVerify + role store" --> DO
    DO -- "Yjs sync step1/step2/update" --> HOOKS

    DO -- "GET /api/documents/id/state" --> API_STATE
    DO -- "PUT /api/documents/id/state" --> API_STATE
    DO -- "POST /api/documents/id/versions" --> API_VER
    API_STATE -- "loadDocumentState / saveDocumentState" --> DOCS
    API_VER -- "createVersion / listVersions" --> VERSIONS

    API_RESTORE -- "POST /parties/main/id?action=restore" --> DO
    API_RESTORE -- "getVersionSnapshot" --> VERSIONS

    API_AI -- "streamText" --> GEM

    NEXTAUTH -- "bcrypt verify" --> USERS
```

---

## Directory Structure

```
inkwell/
├── app/                            # Next.js App Router
│   ├── (auth)/
│   │   ├── login/page.tsx          # Sign-in page
│   │   └── register/page.tsx       # Registration page
│   ├── api/
│   │   ├── ai/route.ts             # Gemini streaming endpoint
│   │   ├── auth/[...nextauth]/     # NextAuth handlers
│   │   └── documents/[id]/
│   │       ├── state/route.ts      # GET/PUT Y.Doc binary (room JWT auth)
│   │       └── versions/
│   │           ├── route.ts        # GET list / POST snapshot
│   │           └── [versionId]/
│   │               ├── route.ts    # GET snapshot bytes
│   │               └── restore/route.ts  # POST → DO restore
│   ├── documents/[id]/page.tsx     # Document editor page (SSR entry)
│   ├── layout.tsx                  # Root layout + SessionProvider
│   └── page.tsx                    # Dashboard (document list)
│
├── features/
│   ├── editor/
│   │   ├── EditorShell.tsx         # Orchestrator: composes hooks + child components
│   │   ├── Editor.tsx              # Tiptap + Collaboration extension
│   │   ├── TitleInput.tsx          # Binds to Y.Text('title')
│   │   ├── useYDoc.ts              # Y.Doc + IndexeddbPersistence
│   │   └── usePartyProvider.ts     # useYProvider wrapper + token fetch
│   └── versions/
│       ├── VersionPanel.tsx        # Sidebar: list + manual snapshot + restore
│       └── VersionPreview.tsx      # Read-only Tiptap preview from snapshot bytes
│
├── server/
│   ├── actions/
│   │   ├── auth.ts                 # register, login, signOutAction
│   │   └── documents.ts            # createDocument, getRoomToken, saveDocumentTitle
│   ├── auth/index.ts               # NextAuth config (Credentials provider + JWT callbacks)
│   └── db/
│       ├── index.ts                # postgres.js client + drizzle()
│       ├── schema.ts               # Table definitions + bytea customType
│       └── queries.ts              # All ORM-scoped queries (server-only)
│
├── party/
│   ├── worker.ts                   # Cloudflare Worker entry + onBeforeConnect edge gate
│   └── index.ts                    # Document Durable Object (Yjs sync + persistence)
│
├── lib/
│   ├── auth.d.ts                   # NextAuth module augmentation (user.id, token.id)
│   ├── schemas.ts                  # Zod validation schemas
│   ├── types.ts                    # Role type, UserSession, shared interfaces
│   └── utils.ts                    # Shared utilities
│
├── components/
│   ├── auth/                       # login-form, register-form
│   └── ui/                         # shadcn/ui primitives
│
├── middleware.ts                   # Auth guard (excludes /api/* for room callbacks)
├── next.config.ts                  # React compiler enabled
├── drizzle.config.ts               # Drizzle → ./server/db/schema.ts
├── wrangler.jsonc                  # DO binding: Main → Document class
├── tsconfig.json                   # Next.js (includes DOM lib)
└── tsconfig.worker.json            # Worker (esnext only, @cloudflare/workers-types)
```

---

## Database Schema

```mermaid
erDiagram
    users {
        uuid id PK
        text email UK
        text name
        text password_hash
        timestamp created_at
    }

    documents {
        uuid id PK
        uuid owner_id FK
        text title
        bytea content
        timestamp created_at
        timestamp updated_at
    }

    document_permissions {
        uuid id PK
        uuid document_id FK
        uuid user_id FK
        role_enum role
        timestamp granted_at
    }

    document_versions {
        uuid id PK
        uuid document_id FK
        bytea snapshot
        text label
        timestamp created_at
    }

    users ||--o{ documents : "owns"
    users ||--o{ document_permissions : "has"
    documents ||--o{ document_permissions : "has"
    documents ||--o{ document_versions : "has"
```

**Key implementation note:** `content` and `snapshot` are `bytea` columns storing raw `Y.encodeStateAsUpdate()` output. A custom Drizzle `customType` handles the `postgres.js` text-protocol format (`\x<hex>` string) in its `fromDriver` converter.

---

## Authentication & Room Token Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant NextJS as Next.js Server
    participant DB as PostgreSQL
    participant Worker as CF Worker Edge
    participant DO as Durable Object

    Note over User,DO: Phase 1 — Session Auth
    User->>NextJS: POST /api/auth/callback/credentials
    NextJS->>DB: SELECT * FROM users WHERE email = ?
    DB-->>NextJS: user row
    NextJS->>NextJS: bcrypt.compare(password, hash)
    NextJS-->>Browser: Set-Cookie: next-auth.session-token (JWT)

    Note over User,DO: Phase 2 — SSR Page Load
    Browser->>NextJS: GET /documents/[id]
    NextJS->>NextJS: auth() → session.user.id
    NextJS->>DB: SELECT d.*, dp.role FROM documents d JOIN document_permissions dp
    DB-->>NextJS: { id, title, content: Uint8Array, role }
    NextJS-->>Browser: EditorShell props (initialContent, role)

    Note over User,DO: Phase 3 — Room Token Mint
    Browser->>NextJS: getRoomToken(documentId) [Server Action]
    NextJS->>NextJS: auth() → userId
    NextJS->>DB: SELECT role FROM document_permissions WHERE document_id=? AND user_id=?
    DB-->>NextJS: { role: 'editor' }
    NextJS->>NextJS: SignJWT({ sub: userId, doc: documentId, role }, PARTYKIT_SECRET, 5m)
    NextJS-->>Browser: token (HS256 JWT)

    Note over User,DO: Phase 4 — WebSocket Connect
    Browser->>Worker: WSS /parties/main/{documentId}?token=<JWT>
    Worker->>Worker: jwtVerify(token, PARTYKIT_SECRET)
    Worker->>Worker: assert payload.doc === lobby.name
    Worker-->>DO: forward request (allowed)
    DO->>DO: jwtVerify(token) again (defence-in-depth)
    DO->>DO: conn.setState({ role: 'editor' })
    DO-->>Browser: Yjs SYNC_STEP1 (state vector)
```

---

## Local-First Data Layer

```mermaid
flowchart LR
    subgraph DeviceA["Device A (first open)"]
        A1[SSR delivers\ninitialContent: Uint8Array]
        A2{IndexedDB\nempty?}
        A3[Y.applyUpdate\nfrom Postgres bytes]
        A4[IndexedDB\nstores state]
        A5[Y.Doc ready\nonline or offline]
    end

    subgraph DeviceB["Device A (revisit / reload)"]
        B1[SSR delivers\ninitialContent]
        B2{IndexedDB\nempty?}
        B3[Load from IndexedDB\nskip Postgres bytes]
        B4[Y.Doc ready\noffline-first]
    end

    subgraph Sync["Online Sync"]
        S1[WebSocket connects\nto Durable Object]
        S2[DO sends SYNC_STEP1\nstate vector]
        S3[Client replies SYNC_STEP2\nmissing updates delta]
        S4[Both sides converge\nvia Yjs CRDT]
    end

    A1 --> A2
    A2 -- Yes --> A3
    A3 --> A4
    A4 --> A5
    A2 -- No --> A5

    B1 --> B2
    B2 -- Yes --> B3
    B3 --> B4
    B2 -- No --> B4

    A5 --> S1
    B4 --> S1
    S1 --> S2 --> S3 --> S4
```

**Priority order (implemented in `features/editor/useYDoc.ts`):**
1. `IndexeddbPersistence` restores from the browser's IndexedDB first
2. Only if IndexedDB is empty (`byteLength <= 2`), seed with `initialContent` from SSR (Postgres bytes)
3. After `synced`, the WebSocket provider reconciles any delta with the Durable Object

This means edits made offline survive page reloads (IndexedDB) and sync automatically when connectivity returns.

---

## Realtime Sync Architecture

```mermaid
sequenceDiagram
    participant ClientA as Client A (editor)
    participant ClientB as Client B (viewer)
    participant DO as Durable Object\n(authoritative Y.Doc)

    Note over ClientA,DO: New connection
    DO-->>ClientA: MESSAGE_SYNC: SYNC_STEP1 (state vector)
    ClientA->>DO: MESSAGE_SYNC: SYNC_STEP2 (missing updates diff)
    DO->>DO: Y.applyUpdate → doc.on('update') fires

    Note over ClientA,DO: Client A types
    ClientA->>DO: MESSAGE_SYNC: UPDATE (Yjs binary)
    DO->>DO: syncProtocol.readSyncMessage → mutates this.doc
    DO->>DO: doc.on('update') → broadcast to all peers
    DO-->>ClientB: MESSAGE_SYNC: UPDATE (same bytes)

    Note over ClientB,DO: Viewer write attempt (blocked)
    ClientB->>DO: MESSAGE_SYNC: UPDATE (Yjs binary)
    DO->>DO: peek sub-type → SYNC_STEP2 or UPDATE
    DO->>DO: conn.state.role === 'viewer' → DROP message
    Note over ClientB: Write silently discarded

    Note over ClientA,DO: Awareness (presence)
    ClientA->>DO: MESSAGE_AWARENESS (cursor position)
    DO->>DO: applyAwarenessUpdate (in-memory only)
    DO-->>ClientB: MESSAGE_AWARENESS (relay raw bytes)
    Note over DO: Awareness never persisted — ephemeral only
```

**Viewer write-guard** is implemented in `party/index.ts` `onMessage()`: after reading the message type byte, the code saves and restores the decoder position to peek at the Yjs sub-type without consuming it. If the sender is a viewer and the sub-type is `SYNC_STEP2 (1)` or `UPDATE (2)`, the message is dropped before reaching `syncProtocol.readSyncMessage`.

---

## Persistence & Alarm Flow

```mermaid
sequenceDiagram
    participant Client as Client (any)
    participant DO as Durable Object
    participant Storage as DO Alarm Storage
    participant NextAPI as Next.js API\n/api/documents/id/state
    participant DB as PostgreSQL

    Client->>DO: MESSAGE_SYNC: UPDATE
    DO->>DO: Y.applyUpdate → broadcast to peers
    DO->>Storage: setAlarm(now + 2000ms)
    Note over Storage: Each edit resets the 2-second window

    Client->>DO: MESSAGE_SYNC: UPDATE (another edit)
    DO->>Storage: setAlarm(now + 2000ms) (reset)

    Note over DO,DB: 2 seconds of silence
    Storage-->>DO: onAlarm() fires
    DO->>DO: mintRoomJWT({ sub:'room', role:'room', doc:id }, 30s)
    DO->>NextAPI: PUT /api/documents/{id}/state (Bearer room JWT)\nbody: Y.encodeStateAsUpdate(this.doc)
    NextAPI->>NextAPI: verifyRoomToken (sub=room, role=room, doc=id)
    NextAPI->>DB: UPDATE documents SET content = $bytes WHERE id = ?
    DB-->>NextAPI: ok
    NextAPI-->>DO: 200

    alt Every 5 minutes
        DO->>NextAPI: POST /api/documents/{id}/versions (Bearer room JWT)\nbody: same bytes, label: 'Auto – <ISO>'
        NextAPI->>DB: INSERT INTO document_versions (snapshot, label)
    end

    Note over DO,DB: Last client disconnects
    Client->>DO: onClose()
    DO->>Storage: deleteAlarm()
    DO->>NextAPI: PUT /api/documents/{id}/state (immediate, no debounce)
```

---

## Version History & Restore

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant NextAPI as Next.js API Routes
    participant DO as Durable Object
    participant DB as PostgreSQL

    Note over User,DB: Manual Snapshot
    User->>Browser: Click "Save Version"
    Browser->>NextAPI: POST /api/documents/{id}/versions\n(session cookie)
    NextAPI->>NextAPI: auth() → userId, check editor/owner
    NextAPI->>DB: SELECT content FROM documents WHERE id=?
    DB-->>NextAPI: bytea
    NextAPI->>DB: INSERT INTO document_versions (snapshot, label='Manual – <ISO>')
    NextAPI-->>Browser: { id, label, createdAt }

    Note over User,DB: Preview Version
    User->>Browser: Click version in VersionPanel
    Browser->>NextAPI: GET /api/documents/{id}/versions/{versionId}
    NextAPI->>DB: SELECT snapshot FROM document_versions WHERE id=?
    DB-->>NextAPI: bytea
    NextAPI-->>Browser: application/octet-stream
    Browser->>Browser: VersionPreview: Y.applyUpdate into temp Y.Doc\nread-only Tiptap renders it

    Note over User,DB: Restore Version (non-destructive CRDT apply)
    User->>Browser: Click "Restore"
    Browser->>NextAPI: POST /api/documents/{id}/versions/{versionId}/restore\n(session cookie)
    NextAPI->>NextAPI: auth() → check editor/owner
    NextAPI->>DB: SELECT snapshot FROM document_versions WHERE id=?
    DB-->>NextAPI: snapshot bytes
    NextAPI->>NextAPI: mintRoomJWT({ sub:'room', role:'room', doc:id }, 30s)
    NextAPI->>DO: POST /parties/main/{id}?action=restore\n(Bearer room JWT, body: snapshot bytes)
    DO->>DO: verifyRoomToken
    DO->>DO: applyRestore(snapshotBytes):\n  temp Y.Doc from snapshot\n  doc.transact(() => {\n    clear Y.Text('title'), reinsert\n    clear Y.XmlFragment('default'), clone nodes\n  })
    DO->>DO: Single Yjs transaction → doc.on('update') fires
    DO-->>Browser: broadcast delta to ALL connected clients
    Note over Browser: All peers see restore instantly\nCRDT semantics preserved
```

**Why non-destructive?** Replacing `this.doc` outright would corrupt active collaborators whose Y.Doc instances are mid-session. Instead, `applyRestore` operates within a single `doc.transact()` — producing one atomic Yjs update that peers merge cleanly.

---

## AI Integration

```mermaid
sequenceDiagram
    actor User
    participant Editor as Tiptap Editor\n(BubbleMenu)
    participant NextAPI as Next.js\n/api/ai
    participant Gemini as Google Gemini\n2.5 Flash
    participant YDOC as Y.Doc

    User->>Editor: Select text → "Improve with AI" button
    Note over Editor: Only shown for owner/editor role
    Editor->>NextAPI: POST /api/ai\n{ text: selectedText, action: 'improve' }\n(session cookie)
    NextAPI->>NextAPI: auth() → check owner/editor permission
    NextAPI->>Gemini: streamText({ model, prompt })
    Gemini-->>NextAPI: token stream
    NextAPI-->>Editor: ReadableStream (raw text, not SSE)
    Editor->>Editor: Stream tokens into preview overlay
    User->>Editor: Click "Insert"
    Editor->>Editor: editor.chain().insertContentAt(range, text).run()
    Editor->>YDOC: ProseMirror tx → Y.Doc.transact()
    YDOC->>YDOC: doc.on('update') fires → broadcast to peers
```

The AI route caps selected text at 10,000 characters. Only `owner` and `editor` roles can call it — viewers see neither the BubbleMenu button nor can they call the API (server-side check).

---

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | — | NextAuth session handlers |
| `/api/ai` | POST | Session (owner/editor) | Stream Gemini text improvement |
| `/api/documents/[id]/state` | GET | Room JWT | DO loads Y.Doc binary from Postgres |
| `/api/documents/[id]/state` | PUT | Room JWT | DO saves Y.Doc binary to Postgres |
| `/api/documents/[id]/versions` | GET | Session | List version metadata |
| `/api/documents/[id]/versions` | POST | Session or Room JWT | Create manual or auto snapshot |
| `/api/documents/[id]/versions/[vid]` | GET | Session | Fetch snapshot bytes for preview |
| `/api/documents/[id]/versions/[vid]/restore` | POST | Session (editor/owner) | Trigger non-destructive CRDT restore |

**Room JWT** (`{ sub: 'room', role: 'room', doc: documentId }`) is used by the Durable Object to call back into Next.js. The state/versions endpoints accept both session auth (users) and room JWTs (the DO) via `verifyRoomToken`.

---

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | Next.js + Drizzle | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Next.js | NextAuth JWT signing secret |
| `NEXTAUTH_URL` | Next.js | Auth callback base URL |
| `PARTYKIT_SECRET` | Next.js + CF Worker | HS256 HMAC secret for room JWTs (shared) |
| `NEXT_PUBLIC_PARTYKIT_HOST` | Browser + Next.js | PartyKit host (`127.0.0.1:8787` dev / CF subdomain prod) |
| `APP_URL` | CF Worker (DO) | Base URL for DO→Next.js API callbacks |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Next.js | Gemini API key |

`PARTYKIT_SECRET` is the only secret shared between the Next.js runtime and the Cloudflare Worker. It is loaded via `process.env.PARTYKIT_SECRET` in Next.js and `this.room.env.PARTYKIT_SECRET` in the DO.

---

## Security Model

### Role Enforcement
Roles are resolved server-side from the database on every sensitive operation — never from client-supplied values:

```
Client sends JWT token (contains role claim)
  → getRoomToken() Server Action: ignores client claims, reads role from DB
  → Token minted with DB-sourced role
  → DO: re-reads role from the verified token (not from a client message)
  → conn.setState({ role }) — role is stored on the connection, not re-read from client
```

### Double JWT Verification
The room token is verified at **two independent points**:

1. **Worker `onBeforeConnect`** — edge gate; rejects before the Durable Object is started
2. **DO `onConnect`** — second independent verify; stores role on connection state

If either check fails the connection is rejected with HTTP 403.

### Viewer Write Gate
In `party/index.ts` `onMessage()`, for every `MESSAGE_SYNC` frame the code peeks at the Yjs sub-type byte:
- `SYNC_STEP1 (0)` — always allowed (viewers need to receive the full doc state)
- `SYNC_STEP2 (1)` or `UPDATE (2)` — dropped for `viewer` role connections

Awareness (`MESSAGE_AWARENESS`) is never gated — viewers appear in presence cursors.

### ORM-Scoped Queries
Every database query in `server/db/queries.ts` filters by the authenticated user's `documentPermissions` rows. There is no route where a user can access document data without a matching permission row:

```ts
// Example: getDocumentWithContent
db.select({ ... })
  .from(documents)
  .innerJoin(documentPermissions, eq(documentPermissions.documentId, documents.id))
  .where(and(eq(documents.id, id), eq(documentPermissions.userId, userId)))
```

### middleware.ts
Protects all non-API routes. The matcher explicitly excludes `/api/*` so the Durable Object's room JWT callbacks (`GET /api/documents/[id]/state`, `PUT ...`, `POST .../versions`) are not redirected to `/login`.

---

## Key Invariants

| # | Invariant |
|---|---|
| 1 | The in-memory `Y.Doc` is the working copy; IndexedDB is the local source of truth; Postgres is the system of record. |
| 2 | Conflict resolution is handled entirely by the Yjs CRDT. No last-write-wins, no timestamps, no hand-rolled merge logic. |
| 3 | One Durable Object per document (keyed by `documentId`). This eliminates the need for a Redis backplane. |
| 4 | Postgres is never written on every keystroke — only on a 2-second debounced DO alarm and on last-connection close. |
| 5 | Version restore never replaces the live `Y.Doc` — it applies a delta within a single `doc.transact()` to preserve CRDT integrity for all active collaborators. |
| 6 | Viewer write attempts are silently dropped at the DO message handler — viewers can observe but never mutate. |
| 7 | Room JWTs expire in 5 minutes; `usePartyProvider` calls `getRoomToken()` before every connect/reconnect. |
