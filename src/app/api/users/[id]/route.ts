import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req, { admin: true })
  const { id } = await params
  if (!isUuid(id)) throw new ApiError(400, 'Usuário inválido.')
  const b = await readJson<{ role?: string; active?: boolean; full_name?: string; password?: string }>(req)
  const db = createAdminClient()
  const { data: target } = await db.from('profiles').select('id, email, role, active').eq('id', id).maybeSingle()
  if (!target) throw new ApiError(404, 'Usuário não encontrado.')

  const update: Record<string, unknown> = {}
  if (b.full_name !== undefined) update.full_name = String(b.full_name).trim().slice(0, 120)
  if (b.role !== undefined) update.role = b.role === 'admin' ? 'admin' : 'operador'
  if (b.active !== undefined) update.active = !!b.active

  const losingAdmin = target.role === 'admin' && target.active && (update.role === 'operador' || update.active === false)
  if (losingAdmin) {
    if (id === user.id) throw new ApiError(422, 'Você não pode remover o seu próprio acesso de administrador.')
    const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true)
    if ((count ?? 0) <= 1) throw new ApiError(422, 'É preciso manter pelo menos um administrador ativo.')
  }

  if (b.password !== undefined) {
    if (String(b.password).length < 10) throw new ApiError(422, 'A nova senha precisa ter pelo menos 10 caracteres.')
    const { error } = await db.auth.admin.updateUserById(id, { password: String(b.password) })
    if (error) throw new ApiError(422, error.message)
  }
  if (update.active !== undefined && update.active !== target.active) {
    // Bloqueia também o login no Supabase Auth
    await db.auth.admin.updateUserById(id, { ban_duration: update.active ? 'none' : '876000h' })
  }
  if (Object.keys(update).length) {
    const { error } = await db.from('profiles').update(update).eq('id', id)
    if (error) throw new Error(error.message)
  }
  await audit(user, 'usuario_alterado', {
    entity: 'user',
    entityId: id,
    details: { email: target.email, ...update, ...(b.password !== undefined ? { senha: 'redefinida' } : {}) },
  })
  return json({ ok: true })
})
