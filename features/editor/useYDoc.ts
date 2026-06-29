'use client'
import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export function useYDoc(documentId: string, initialState?: Uint8Array) {
  const docRef = useRef<Y.Doc | null>(null)
  if (!docRef.current) docRef.current = new Y.Doc()

  const initialStateRef = useRef(initialState)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    const doc = docRef.current!
    const persistence = new IndexeddbPersistence(`inkwell-doc-${documentId}`, doc)

    persistence.on('synced', () => {
      // Seed from Postgres only if IndexedDB had nothing stored for this doc
      const isEmpty = Y.encodeStateAsUpdate(doc).byteLength <= 2
      if (isEmpty && initialStateRef.current?.length) {
        Y.applyUpdate(doc, initialStateRef.current)
      }
      setSynced(true)
    })

    return () => { persistence.destroy() }
  }, [documentId])

  return { doc: docRef.current, synced }
}
