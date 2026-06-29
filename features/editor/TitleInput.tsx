'use client'
import { useEffect, useRef, useCallback } from 'react'
import * as Y from 'yjs'
import { saveDocumentTitle } from '@/server/actions/documents'

interface Props {
  doc: Y.Doc
  documentId: string
  initialTitle: string
}

export function TitleInput({ doc, documentId, initialTitle }: Props) {
  const yTitle = doc.getText('title')
  const inputRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Seed Y.Text if this is the first time opening the doc locally
    if (yTitle.length === 0) {
      doc.transact(() => yTitle.insert(0, initialTitle))
    }
    if (inputRef.current) {
      inputRef.current.value = yTitle.toString()
    }

    // Keep input in sync with Y.Text (will matter when multiplayer arrives in session 3)
    const observer = () => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.value = yTitle.toString()
      }
    }
    yTitle.observe(observer)
    return () => yTitle.unobserve(observer)
  }, [doc, yTitle, initialTitle])

  const scheduleSave = useCallback(
    (title: string) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveDocumentTitle(documentId, title).catch(console.error)
      }, 1000)
    },
    [documentId],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    doc.transact(() => {
      yTitle.delete(0, yTitle.length)
      yTitle.insert(0, val)
    })
    scheduleSave(val)
  }

  return (
    <input
      ref={inputRef}
      className="w-full text-3xl font-semibold bg-transparent border-none outline-none focus:outline-none placeholder:text-muted-foreground"
      placeholder="Untitled"
      onChange={handleChange}
    />
  )
}
