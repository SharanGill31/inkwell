import { LoginForm } from '@/components/auth/login-form'

export const metadata = { title: 'Sign in — Inkwell' }

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <LoginForm />
    </div>
  )
}
