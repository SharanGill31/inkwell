import { routePartykitRequest, type Lobby } from 'partyserver'
import { jwtVerify } from 'jose'
import Document, { type RoomEnv } from './index'

// Expose the Durable Object class to wrangler so the `Main` binding
// (`class_name: "Document"`) can resolve it. Binding `Main` kebabs to `main`,
// matching the y-partyserver client's default route `/parties/main/{room}`.
export { Document }

export default {
  async fetch(request: Request, env: RoomEnv): Promise<Response> {
    return (
      (await routePartykitRequest(request, env, {
        // Edge JWT gate (was PartyKit's static onBeforeConnect). Runs before the
        // Durable Object is touched; rejects unknown callers here.
        onBeforeConnect: async (req, lobby: Lobby) => {
          try {
            const token = new URL(req.url).searchParams.get('token')
            if (!token) return new Response('Unauthorized', { status: 401 })

            const secret = env.PARTYKIT_SECRET
            if (!secret) {
              console.error('[onBeforeConnect] PARTYKIT_SECRET missing from env')
              return new Response('Unauthorized', { status: 401 })
            }

            const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
            // Token must be scoped to this exact room (room name === documentId)
            if (payload.doc !== lobby.name) return new Response('Forbidden', { status: 403 })
            return req
          } catch (err) {
            console.error('[onBeforeConnect] error:', err)
            return new Response('Unauthorized', { status: 401 })
          }
        },
      })) ?? new Response('Not Found', { status: 404 })
    )
  },
} satisfies ExportedHandler<RoomEnv>
