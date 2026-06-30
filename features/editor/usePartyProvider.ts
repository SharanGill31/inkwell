'use client'
import { useEffect, useState } from 'react'
import useYProvider from 'y-partyserver/react'
import type * as Y from 'yjs'
import { getRoomToken } from '@/server/actions/documents'

export function usePartyProvider(doc: Y.Doc, documentId: string) {
  // wrangler dev serves the Worker on :8787 (partykit used :1999).
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? '127.0.0.1:8787'

  const provider = useYProvider({
    host,
    room: documentId,
    doc,
    options: {
      // Called before every connect attempt (including reconnects) so tokens stay fresh
      params: async () => {
        const token = await getRoomToken(documentId)
        return { token }
      },
    },
  })

  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const handleStatus = ({ status }: { status: string }) => {
      setConnected(status === 'connected')
    }
    provider.on('status', handleStatus)
    setConnected(provider.wsconnected)
    return () => { provider.off('status', handleStatus) }
  }, [provider])

  return { connected }
}
