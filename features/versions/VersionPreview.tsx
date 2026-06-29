'use client'
import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'

interface PreviewEditorProps {
  doc: Y.Doc
}

function PreviewEditor({ doc }: PreviewEditorProps) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: doc }),
      ],
      editable: false,
      editorProps: { attributes: { class: 'tiptap-editor outline-none' } },
    },
    [doc],
  )
  return <EditorContent editor={editor} />
}

interface Props {
  documentId: string
  versionId: string
  label: string
  onClose: () => void
}

export function VersionPreview({ documentId, versionId, label, onClose }: Props) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setBytes(null)
    setError(false)
    fetch(`/api/documents/${documentId}/versions/${versionId}`)
      .then(async res => {
        if (!res.ok) throw new Error(`${res.status}`)
        setBytes(new Uint8Array(await res.arrayBuffer()))
      })
      .catch(() => setError(true))
  }, [documentId, versionId])

  // tempDoc is isolated — no room connection, no IndexedDB, never touches the live doc
  const tempDoc = useMemo(() => {
    if (!bytes) return null
    const d = new Y.Doc()
    Y.applyUpdate(d, bytes)
    return d
  }, [bytes])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="font-semibold truncate pr-4">{label}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-1">
          {error && (
            <p className="text-destructive text-sm">Failed to load snapshot.</p>
          )}
          {!error && !tempDoc && (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
          {tempDoc && <PreviewEditor doc={tempDoc} />}
        </div>

        <div className="px-6 py-3 border-t shrink-0 text-xs text-muted-foreground">
          Read-only preview — live document is unchanged
        </div>
      </div>
    </div>
  )
}
