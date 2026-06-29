'use client'
import { useYDoc } from './useYDoc'
import { usePartyProvider } from './usePartyProvider'
import { TitleInput } from './TitleInput'
import { Editor } from './Editor'
import { VersionPanel } from '@/features/versions/VersionPanel'

interface Props {
  documentId: string
  initialTitle: string
  initialContent: Uint8Array | null
  userRole: 'owner' | 'editor' | 'viewer'
}

export function EditorShell({ documentId, initialTitle, initialContent, userRole }: Props) {
  const { doc, synced } = useYDoc(documentId, initialContent ?? undefined)
  const { connected } = usePartyProvider(doc, documentId)

  if (!synced) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-muted rounded-md w-1/2" />
        <div className="space-y-3 pt-6">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-5/6" />
          <div className="h-4 bg-muted rounded w-4/6" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <TitleInput doc={doc} documentId={documentId} initialTitle={initialTitle} />
          <div className="flex items-center gap-1.5 pt-3 shrink-0 text-xs text-muted-foreground select-none">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
            />
            {connected ? 'Live' : 'Offline'}
          </div>
        </div>
        <div className="border-t pt-6">
          <Editor doc={doc} documentId={documentId} userRole={userRole} />
        </div>
      </div>
      <VersionPanel documentId={documentId} userRole={userRole} />
    </div>
  )
}
