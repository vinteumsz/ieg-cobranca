import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createAdminClient, createUserClient } from './supabase/server'
import type { Profile } from './types'

export type SessionUser = Profile

/** Usuário logado com perfil ativo, ou null. Validado no servidor do Supabase. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .maybeSingle()
  const profile = data as Profile | null
  if (!profile || !profile.active) return null
  return profile
})

/** Para páginas: exige login com perfil ativo. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/auth/sair?motivo=acesso')
  return user
}

/** Para páginas administrativas. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/?aviso=somente-admin')
  return user
}

export function displayUser(u: SessionUser): string {
  return u.full_name?.trim() || u.email
}
