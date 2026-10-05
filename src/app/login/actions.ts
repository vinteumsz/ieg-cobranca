'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { createAdminClient, createUserClient } from '@/lib/supabase/server'

export type LoginState = { error?: string }

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === 'string' ? v : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/login') ? s : '/'
}

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  if (!email || !password) return { error: 'Informe e-mail e senha.' }

  const supabase = await createUserClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    await audit(null, 'login_falhou', { email, details: { motivo: error?.message ?? 'desconhecido' } })
    return { error: 'E-mail ou senha incorretos.' }
  }

  const { data: profile } = await createAdminClient().from('profiles').select('active').eq('id', data.user.id).maybeSingle()
  if (!profile?.active) {
    await supabase.auth.signOut()
    await audit({ id: data.user.id, email }, 'login_falhou', { details: { motivo: 'usuário inativo' } })
    return { error: 'Seu acesso está desativado. Fale com a administração.' }
  }

  await audit({ id: data.user.id, email }, 'login')
  redirect(safeNext(form.get('voltar')))
}
