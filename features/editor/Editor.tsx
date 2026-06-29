'use client'
import { useState } from 'react'
import * as Y from 'yjs'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'

interface Props {
  doc: Y.Doc
  documentId: string
  userRole: 'owner' | 'editor' | 'viewer'
}

export function Editor({ doc, documentId, userRole }: Props) {
  const [savedRange, setSavedRange] = useState<{ from: number; to: number } | null>(null)
  const [streamedText, setStreamedText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const editor = useEditor({
    extensions: [
      // Disable built-in history — Yjs Collaboration extension provides undo/redo
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
    ],
    editorProps: {
      attributes: {
        class: 'tiptap-editor outline-none min-h-[60vh]',
      },
    },
  })

  const canWrite = userRole === 'owner' || userRole === 'editor'

  async function handleImprove() {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const selectedText = editor.state.doc.textBetween(from, to, '\n')
    setSavedRange({ from, to })
    setStreamedText('')
    setIsStreaming(true)

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId, selectedText, action: 'improve' }),
      })
      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreamedText(prev => prev + chunk)
      }
      if (!accumulated) setSavedRange(null) // auto-dismiss on empty response
    } catch {
      setSavedRange(null)
    } finally {
      setIsStreaming(false)
    }
  }

  function handleConfirm() {
    if (!editor || !savedRange || !streamedText) return
    // editor.chain()...run() issues ONE ProseMirror transaction. y-prosemirror converts
    // it to a single doc.transact() Yjs update: one broadcast to peers, one room alarm/
    // persist, no per-token writes. No explicit doc.transact() wrapper needed here.
    // Passing {from, to} to insertContentAt deletes the range and inserts the AI text
    // atomically — one chain, one run, never an intermediate empty state broadcast.
    // Note: savedRange is captured at click time; concurrent edits during streaming
    // could make these positions stale, but we keep it simple for now.
    editor.chain().focus().insertContentAt({ from: savedRange.from, to: savedRange.to }, streamedText).run()
    handleDismiss()
  }

  function handleDismiss() {
    setSavedRange(null)
    setStreamedText('')
    setIsStreaming(false)
  }

  return (
    <div>
      {editor && canWrite && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ from, to }) => from !== to && !isStreaming && savedRange === null}
        >
          <button
            onClick={handleImprove}
            className="text-xs bg-background border rounded-md px-2.5 py-1 shadow-md hover:bg-muted transition-colors"
          >
            ✦ Improve with AI
          </button>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {savedRange !== null && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">AI suggestion</span>
            {isStreaming && (
              <span className="text-xs text-muted-foreground animate-pulse">Generating…</span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap min-h-[2rem]">
            {streamedText}
            {isStreaming && <span className="animate-pulse">▍</span>}
          </p>
          {!isStreaming && (
            <div className="flex gap-2 pt-1">
              {streamedText && (
                <button
                  onClick={handleConfirm}
                  className="text-xs bg-primary text-primary-foreground rounded px-3 py-1.5 hover:bg-primary/90 transition-colors"
                >
                  Insert
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
