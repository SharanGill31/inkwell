'use server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { AuthError } from 'next-auth'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { signIn, signOut } from '@/server/auth'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { credentialsSchema } from '@/lib/schemas'
import { getUserByEmail } from '@/server/db/queries'

const registerSchema = credentialsSchema.extend({ name: z.string().min(1).optional() })

export type AuthFormState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function register(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }
  const { email, password, name } = parsed.data
  if (await getUserByEmail(email)) return { errors: { email: ['Email already in use'] } }
  const passwordHash = await bcrypt.hash(password, 12)
  await db.insert(users).values({ email, name: name ?? null, passwordHash })
  // signIn throws NEXT_REDIRECT on success — intentional, do not catch
  await signIn('credentials', { email, password, redirectTo: '/' })
  return {}
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }
  try {
    await signIn('credentials', { ...parsed.data, redirectTo: '/' })
  } catch (e) {
    if (isRedirectError(e)) throw e          // success path — let the redirect through
    if (e instanceof AuthError) return { message: 'Invalid email or password' }
    throw e                                   // unexpected error
  }
  return {}
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
