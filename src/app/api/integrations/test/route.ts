import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { sendTest } from '@/lib/send/service'

export const runtime = 'nodejs'

// Envio de teste para o contato que o administrador digitar (não usa dados de responsáveis).
export const POST = route(async (req: NextRequest) => {
  const user = await apiAuth(req, { admin: true })
  const { channel, to } = await readJson<{ channel: 'whatsapp' | 'email'; to: string }>(req)
  if (channel !== 'whatsapp' && channel !== 'email') throw new ApiError(400, 'Canal inválido.')
  const r = await sendTest(channel, String(to ?? ''))
  await audit(user, 'envio_teste', { details: { canal: channel, ok: r.ok } })
  if (!r.ok) throw new ApiError(422, r.error)
  return json({ ok: true, id: r.id })
})
