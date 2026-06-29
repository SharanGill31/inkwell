import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/server/auth'
import { getDocumentsByUser } from '@/server/db/queries'
import { createDocument } from '@/server/actions/documents'
import { signOutAction } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Dashboard — Inkwell' }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const docs = await getDocumentsByUser(session.user.id)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-lg">Inkwell</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {session.user.name ?? session.user.email}
            </span>
            <form action={signOutAction}>
              <Button variant="ghost" size="sm" type="submit">Sign out</Button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">My Documents</h1>
          <form action={createDocument}>
            <Button type="submit" size="sm">New Document</Button>
          </form>
        </div>

        {docs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No documents yet. Click &ldquo;New Document&rdquo; to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border hover:bg-muted transition-colors"
                >
                  <span className="font-medium">{doc.title}</span>
                  <span className="text-xs text-muted-foreground capitalize">{doc.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
