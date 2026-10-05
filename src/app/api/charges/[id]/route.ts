import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { displayUser } from '@/lib/auth'
import type { ChargeWarning } from '@/lib/billing/rules'
import { isValidEmail, parseBrPhone } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/server'
import type { ChargeRow } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

type Body =
  | { action: 'contato'; phone: string; email: string }
  | { action: 'mensagem'; wa_text_override?: string | null; wa_params_override?: string[] | null; email_subject_override?: string | null; email_body_override?: string | null }
  | { action: 'conferido'; reviewed: boolean }
  | { action: 'cancelar'; reason?: string }
  | { action: 'reabrir' }

const PHONE_CODES = ['sem_celular', 'telefone_fixo', 'celular_invalido', 'nono_digito', 'telefone_compartilhado']
const EMAIL_CODES = ['sem_email', 'email_invalido', 'email_compartilhado']
const limit = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)

export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req)
  const { id } = await params
  if (!isUuid(id)) throw new ApiError(400, 'Cobrança inválida.')
  const body = await readJson<Body>(req)
  const db = createAdminClient()
  const { data } = await db.from('charges').select('*').eq('id', id).maybeSingle()
  const charge = data as ChargeRow | null
  if (!charge) throw new ApiError(404, 'Cobrança não encontrada.')

  let update: Record<string, unknown> = {}
  let auditAction: Parameters<typeof audit>[1] = 'cobranca_editada'
  let details: Record<string, unknown> = {}

  switch (body.action) {
    case 'contato': {
      const phoneRaw = (body.phone ?? '').trim()
      const emailRaw = (body.email ?? '').trim().toLowerCase()
      const phone = phoneRaw ? parseBrPhone(phoneRaw) : null
      if (phone && phone.kind !== 'celular') throw new ApiError(422, 'Informe um celular válido com DDD, por exemplo (83) 99999-9999.')
      if (emailRaw && !isValidEmail(emailRaw)) throw new ApiError(422, 'E-mail inválido.')
      const warnings: ChargeWarning[] = (charge.warnings ?? []).filter((w) => {
        if (PHONE_CODES.includes(w.code) && (phone?.e164 ?? null) !== charge.guardian_phone) return false
        if (EMAIL_CODES.includes(w.code) && (emailRaw || null) !== charge.guardian_email) return false
        return true
      })
      if (!phone && !warnings.some((w) => w.code === 'sem_celular')) warnings.push({ code: 'sem_celular', level: 'atencao', message: 'Sem celular: não será possível enviar WhatsApp.' })
      if (!emailRaw && !warnings.some((w) => w.code === 'sem_email')) warnings.push({ code: 'sem_email', level: 'atencao', message: 'Sem e-mail cadastrado.' })
      update = { guardian_phone: phone?.e164 || null, guardian_email: emailRaw || null, contact_edited: true, warnings }
      details = {
        telefone_alterado: (phone?.e164 ?? null) !== charge.guardian_phone,
        email_alterado: (emailRaw || null) !== charge.guardian_email,
      }
      break
    }
    case 'mensagem': {
      if ('wa_text_override' in body) update.wa_text_override = limit(body.wa_text_override, 4000) || null
      if ('wa_params_override' in body) {
        update.wa_params_override = Array.isArray(body.wa_params_override) ? body.wa_params_override.slice(0, 20).map((p) => String(p).slice(0, 1000)) : null
      }
      if ('email_subject_override' in body) update.email_subject_override = limit(body.email_subject_override, 300) || null
      if ('email_body_override' in body) update.email_body_override = limit(body.email_body_override, 20000) || null
      details = { campos: Object.keys(update) }
      break
    }
    case 'conferido':
      update = { reviewed: !!body.reviewed, reviewed_by: body.reviewed ? user.id : null, reviewed_at: body.reviewed ? new Date().toISOString() : null }
      auditAction = 'cobranca_conferida'
      details = { conferido: !!body.reviewed }
      break
    case 'cancelar': {
      const reason = limit(body.reason, 300)?.trim() || null
      update = { status: 'cancelado', cancel_reason: reason }
      auditAction = 'cobranca_cancelada'
      details = { motivo: reason }
      await db.from('dispatches').insert({
        batch_id: randomUUID(),
        charge_id: charge.id,
        import_id: charge.import_id,
        group_key: charge.group_key,
        guardian_name: charge.guardian_name,
        guardian_cpf: charge.guardian_cpf,
        student_name: charge.student_name,
        amount_cents: charge.total_open_cents,
        channels: [],
        status: 'cancelado',
        note: reason ? `Cobrança cancelada: ${reason}` : 'Cobrança cancelada pela equipe.',
        sent_by: user.id,
        sent_by_name: displayUser(user),
      })
      break
    }
    case 'reabrir':
      update = { status: charge.last_sent_at ? 'enviado' : 'pendente', cancel_reason: null }
      auditAction = 'cobranca_reaberta'
      break
    default:
      throw new ApiError(400, 'Ação desconhecida.')
  }

  const { data: updated, error } = await db.from('charges').update(update).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  await audit(user, auditAction, { entity: 'charge', entityId: id, details })
  return json({ charge: updated })
})
