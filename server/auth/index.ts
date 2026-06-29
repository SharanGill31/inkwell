import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { credentialsSchema } from '@/lib/schemas'
import { getUserByEmail } from '@/server/db/queries'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null
        const user = await getUserByEmail(parsed.data.email)
        if (!user) return null
        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      return session
    },
  },
})
