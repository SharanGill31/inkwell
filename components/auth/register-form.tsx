'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { register, type AuthFormState } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: AuthFormState = {}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState)

  return (
    <form action={formAction} className="w-full max-w-sm space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground">Get started with Inkwell</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Name <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="name" name="name" type="text" autoComplete="name" />
        {state.errors?.name && (
          <p className="text-xs text-destructive">{state.errors.name[0]}</p>
        )}
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
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        {state.errors?.password && (
          <p className="text-xs text-destructive">{state.errors.password[0]}</p>
        )}
      </div>

      {state.message && (
        <p className="text-sm text-destructive" aria-live="polite">{state.message}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-4 hover:text-primary">
          Sign in
        </Link>
      </p>
    </form>
  )
}
