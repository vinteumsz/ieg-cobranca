import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { isValidEmail } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/server'

export const POST = route(async (req: NextRequest) => {
  const user = await apiAuth(req, { admin: true })
  const b = await readJson<{ email: string; full_name: string; role: string; password: string }>(req)
  const email = String(b.email ?? '').trim().toLowerCase()
  const fullName = String(b.full_name ?? '').trim().slice(0, 120)
  const role = b.role === 'admin' ? 'admin' : 'operador'
  const password = String(b.password ?? '')
  if (!isValidEmail(email)) throw new ApiError(422, 'E-mail inválido.')
  if (!fullName) throw new ApiError(422, 'Informe o nome.')
  if (password.length < 10) throw new ApiError(422, 'A senha inicial precisa ter pelo menos 10 caracteres.')

  const db = createAdminClient()
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
  if (error || !data.user) {
    throw new ApiError(422, /already|registered|exists/i.test(error?.message ?? '') ? 'Já existe um usuário com este e-mail.' : `Não foi possível criar: ${error?.message}`)
  }
  await db.from('profiles').upsert({ id: data.user.id, email, full_name: fullName, role, active: true })
  await audit(user, 'usuario_criado', { entity: 'user', entityId: data.user.id, details: { email, papel: role } })
  return json({ ok: true }, 201)
})
