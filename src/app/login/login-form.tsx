'use client'

import { useActionState } from 'react'
import { Button, Field, Input } from '@/components/ui'
import { signIn, type LoginState } from './actions'

export function LoginForm({ voltar }: { voltar: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {})
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="voltar" value={voltar} />
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && (
        <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="brand" size="lg" className="w-full" loading={pending}>
        Entrar
      </Button>
    </form>
  )
}
