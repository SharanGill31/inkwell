'use client'
import { useState, useEffect, useCallback } from 'react'
import { VersionPreview } from './VersionPreview'

interface Version {
  id: string
  label: string | null
  createdAt: string
}

interface Props {
  documentId: string
  userRole: 'owner' | 'editor' | 'viewer'
}

export function VersionPanel({ documentId, userRole }: Props) {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [preview, setPreview] = useState<Version | null>(null)

  const canWrite = userRole === 'owner' || userRole === 'editor'

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`)
      if (res.ok) setVersions(await res.json())
    } catch {
      // non-fatal
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { fetchVersions() }, [fetchVersions])

  const saveVersion = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || undefined }),
      })
      if (res.ok) {
        setLabel('')
        await fetchVersions()
      }
    } finally {
      setSaving(false)
    }
  }

  const restoreVersion = async (v: Version) => {
    if (!confirm(`Restore "${v.label ?? 'this version'}"?\n\nCurrent content will be replaced across all connected editors.`)) return
    setRestoring(v.id)
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${v.id}/restore`, {
        method: 'POST',
      })
      if (!res.ok) alert('Restore failed — see console for details.')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <>
      <aside className="w-64 shrink-0 space-y-4">
        <h2 className="font-semibold text-sm">Version History</h2>

        {canWrite && (
          <div className="space-y-2">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-full text-sm border rounded px-2 py-1.5 bg-background"
            />
            <button
              onClick={saveVersion}
              disabled={saving}
              className="w-full text-sm bg-primary text-primary-foreground rounded px-3 py-1.5 disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {saving ? 'Saving…' : 'Save version'}
            </button>
          </div>
        )}

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {loading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
          {!loading && versions.length === 0 && (
            <p className="text-xs text-muted-foreground">No versions yet.</p>
          )}
          {versions.map(v => (
            <div key={v.id} className="text-xs border rounded p-2.5 space-y-1.5 bg-card">
              <p className="font-medium truncate">{v.label ?? '—'}</p>
              <p className="text-muted-foreground">
                {new Date(v.createdAt).toLocaleString()}
              </p>
              <div className="flex gap-3 pt-0.5">
                <button
                  onClick={() => setPreview(v)}
                  className="underline text-muted-foreground hover:text-foreground transition-colors"
                >
                  Preview
                </button>
                {canWrite && (
                  <button
                    onClick={() => restoreVersion(v)}
                    disabled={restoring === v.id}
                    className="underline text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {restoring === v.id ? 'Restoring…' : 'Restore'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {preview && (
        <VersionPreview
          documentId={documentId}
          versionId={preview.id}
          label={preview.label ?? '—'}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  )
}
