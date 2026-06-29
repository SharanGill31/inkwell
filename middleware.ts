import { auth } from '@/server/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user?.id
  const { pathname } = req.nextUrl
  const isPublic = pathname === '/login' || pathname === '/register'

  if (isPublic && isLoggedIn) return NextResponse.redirect(new URL('/', req.url))
  if (!isPublic && !isLoggedIn) return NextResponse.redirect(new URL('/login', req.url))
  return NextResponse.next()
})

export const config = {
  // Exclude all /api/* routes — they carry their own auth (Bearer JWT or session check).
  // Only api/auth was previously excluded, which caused the room's Bearer-token fetch to
  // be intercepted, redirected to /login, and return HTML instead of binary state bytes.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
