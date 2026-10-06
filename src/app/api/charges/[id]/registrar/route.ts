import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { displayUser } from '@/lib/auth'
import { composeMessages, toComposeSettings } from '@/lib/billing/compose'
import { hasCritical } from '@/lib/billing/rules'
import { loadSettings } from '@/lib/data'
import { todayISO } from '@/lib/format'
import { effective } from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/server'
import type { ChargeRow } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }
type Channel = 'whatsapp' | 'email'

// Envio manual: o funcionário abriu o WhatsApp/e-mail com a mensagem pronta, enviou,
// e confirma aqui. O registro guarda o texto exato que foi preparado e quem enviou.
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req)
  const { id } = await params
  if (!isUuid(id)) throw new ApiError(400, 'Cobrança inválida.')
  const body = await readJson<{ channels: Channel[]; batchId?: string }>(req)
  const channels = [...new Set(body.channels ?? [])].filter((c): c is Channel => c === 'whatsapp' || c === 'email')
  if (channels.length === 0) throw new ApiError(400, 'Informe o canal usado.')

  const db = createAdminClient()
  const { data } = await db.from('charges').select('*').eq('id', id).maybeSingle()
  const charge = data as ChargeRow | null
  if (!charge) throw new ApiError(404, 'Cobrança não encontrada.')
  if (charge.status === 'cancelado') throw new ApiError(409, 'Esta cobrança foi cancelada.')
  if (hasCritical(charge.warnings) && !charge.reviewed) throw new ApiError(409, 'Confira os alertas e marque a cobrança como conferida antes de enviar.')
  for (const c of channels) {
    if (c === 'whatsapp' && !charge.guardian_phone) throw new ApiError(422, 'Esta cobrança não tem celular.')
    if (c === 'email' && !charge.guardian_email) throw new ApiError(422, 'Esta cobrança não tem e-mail.')
  }

  const settings = await loadSettings()
  const composed = composeMessages(charge, toComposeSettings(effective({ ...settings, send_mode: 'manual' }), todayISO()))
  const now = new Date().toISOString()

  const { data: dispatch, error } = await db
    .from('dispatches')
    .insert({
      batch_id: isUuid(body.batchId) ? body.batchId : randomUUID(),
      charge_id: charge.id,
      import_id: charge.import_id,
      group_key: charge.group_key,
      guardian_name: charge.guardian_name,
      guardian_cpf: charge.guardian_cpf,
      student_name: charge.student_name,
      amount_cents: charge.total_open_cents,
      channels,
      status: 'enviado',
      test_mode: false,
      note: 'Envio manual (mensagem preparada pelo sistema e enviada pelo funcionário).',
      sent_by: user.id,
      sent_by_name: displayUser(user),
    })
    .select('id')
    .single()
  if (error || !dispatch) {
    throw new ApiError(409, 'Este envio já foi registrado.')
  }

  const rows = channels.map((c) => ({
    dispatch_id: dispatch.id,
    charge_id: charge.id,
    channel: c,
    recipient: c === 'whatsapp' ? charge.guardian_phone! : charge.guardian_email!,
    subject: c === 'email' ? composed.email.subject : null,
    body: c === 'whatsapp' ? composed.whatsapp.preview : composed.email.body,
    status: 'enviado',
    provider: 'manual',
    sent_at: now,
  }))
  const { error: mErr } = await db.from('messages').insert(rows)
  if (mErr) throw new Error(mErr.message)

  const update: Record<string, unknown> = { status: charge.status === 'entregue' ? 'entregue' : 'enviado', last_sent_at: now }
  if (channels.includes('whatsapp')) update.wa_status = 'enviado'
  if (channels.includes('email')) update.email_status = 'enviado'
  const { data: updated, error: uErr } = await db.from('charges').update(update).eq('id', id).select('*').single()
  if (uErr) throw new Error(uErr.message)

  await audit(user, 'envio_realizado', { entity: 'charge', entityId: id, details: { modo: 'manual', canais: channels } })
  return json({ charge: updated, sentAt: now })
})
