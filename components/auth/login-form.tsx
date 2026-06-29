'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { login, type AuthFormState } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: AuthFormState = {}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="w-full max-w-sm space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Inkwell</h1>
        <p className="text-sm text-muted-foreground">Enter your email and password</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {state.errors?.email && (
          <p className="text-xs text-destructive">{state.errors.email[0]}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
        {state.errors?.password && (
          <p className="text-xs text-destructive">{state.errors.password[0]}</p>
        )}
      </div>

      {state.message && (
        <p className="text-sm text-destructive" aria-live="polite">{state.message}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/register" className="underline underline-offset-4 hover:text-primary">
          Register
        </Link>
      </p>
    </form>
  )
}
