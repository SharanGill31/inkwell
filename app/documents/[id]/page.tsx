import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/server/auth'
import { getDocumentWithContent } from '@/server/db/queries'
import { EditorShell } from '@/features/editor/EditorShell'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DocumentPage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const doc = await getDocumentWithContent(id, session.user.id)
  if (!doc) notFound()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <EditorShell
          documentId={doc.id}
          initialTitle={doc.title}
          initialContent={doc.content}
          userRole={doc.role}
        />
      </main>
    </div>
  )
}
