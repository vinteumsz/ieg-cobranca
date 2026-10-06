import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { TEMPLATE_VARIABLES } from '@/lib/billing/messages'
import { isValidEmail, parseBrPhone } from '@/lib/format'
import { recalcStoredCharges } from '@/lib/billing/recalc'
import {
  DEFAULT_EMAIL_BODY, DEFAULT_EMAIL_SUBJECT, DEFAULT_WA_TEMPLATE_BODY, DEFAULT_WA_TEMPLATE_PARAMS, DEFAULT_WA_TEXT, normalizeSettings,
  type AmountBasis, type OpenRule, type Settings,
} from '@/lib/settings'
import { createAdminClient } from '@/lib/supabase/server'

const VAR_NAMES = new Set(TEMPLATE_VARIABLES.map((v) => v.name))

const bool = (v: unknown) => {
  if (typeof v !== 'boolean') throw new ApiError(422, 'Valor inválido.')
  return v
}
const oneOf = <T extends string>(v: unknown, list: readonly T[], label: string): T => {
  if (!list.includes(v as T)) throw new ApiError(422, `${label}: opção inválida.`)
  return v as T
}
const numOrNull = (v: unknown, min: number, max: number, label: string): number | null => {
  if (v === null || v === '' || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(422, `${label}: informe um número entre ${min} e ${max}.`)
  return n
}
const int = (v: unknown, min: number, max: number, label: string) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(422, `${label}: informe um número inteiro entre ${min} e ${max}.`)
  return n
}
const text = (v: unknown, max: number, def?: string): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/\r\n/g, '\n').trim()
  if (s.length > max) throw new ApiError(422, `Texto longo demais (máximo ${max} caracteres).`)
  if (!s || (def !== undefined && s === def.trim())) return null
  return s
}

const VALIDATORS: { [K in keyof Settings]?: (v: unknown) => unknown } = {
  open_rule: (v) => oneOf(v, ['sem_pagamento_ou_zerado', 'sem_data_pagamento', 'valor_pago_zerado', 'pago_menor_que_liquido'] as const, 'Regra de parcela em aberto'),
  only_overdue: bool,
  grace_days: (v) => int(v, 0, 60, 'Tolerância'),
  amount_basis: (v) => oneOf(v, ['liquido', 'parcela'] as const, 'Valor considerado'),
  daily_interest_cents: (v) => int(v, 0, 100000, 'Juros por dia'),
  fine_pct: (v) => numOrNull(v, 0, 20, 'Multa (%)'),
  interest_start_date: (v) => {
    if (v === null || v === '') return null
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ApiError(422, 'Data inicial inválida.')
    return v
  },
  show_updated_values: bool,
  cpf_display: (v) => oneOf(v, ['nao_exibir', 'parcial', 'completo'] as const, 'Exibição do CPF'),
  store_original_pdf: bool,
  duplicate_window_days: (v) => int(v, 1, 90, 'Janela de aviso'),
  send_mode: (v) => oneOf(v, ['manual', 'automatico'] as const, 'Forma de envio'),
  test_mode: bool,
  test_phone: (v) => {
    const s = String(v ?? '').trim()
    if (!s) return null
    if (parseBrPhone(s).kind !== 'celular') throw new ApiError(422, 'Celular de teste inválido.')
    return s
  },
  test_email: (v) => {
    const s = String(v ?? '').trim().toLowerCase()
    if (!s) return null
    if (!isValidEmail(s)) throw new ApiError(422, 'E-mail de teste inválido.')
    return s
  },
  wa_mode: (v) => oneOf(v, ['template', 'texto'] as const, 'Modo do WhatsApp'),
  wa_template_name: (v) => {
    const s = String(v ?? '').trim()
    if (!s) return null
    if (!/^[a-z0-9_]{1,512}$/.test(s)) throw new ApiError(422, 'Nome do modelo: use apenas letras minúsculas, números e _ (igual ao cadastrado na Meta).')
    return s
  },
  wa_template_language: (v) => {
    const s = String(v ?? '').trim() || 'pt_BR'
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(s)) throw new ApiError(422, 'Idioma do modelo inválido (ex.: pt_BR).')
    return s
  },
  wa_template_body: (v) => text(v, 1024, DEFAULT_WA_TEMPLATE_BODY),
  wa_template_params: (v) => {
    if (v === null) return null
    if (!Array.isArray(v) || v.length > 10 || !v.every((x) => typeof x === 'string' && VAR_NAMES.has(x))) {
      throw new ApiError(422, 'Variáveis do modelo inválidas.')
    }
    return JSON.stringify(v) === JSON.stringify(DEFAULT_WA_TEMPLATE_PARAMS) ? null : v
  },
  wa_text_template: (v) => text(v, 4096, DEFAULT_WA_TEXT),
  email_subject_template: (v) => text(v, 300, DEFAULT_EMAIL_SUBJECT),
  email_body_template: (v) => text(v, 20000, DEFAULT_EMAIL_BODY),
  email_sender_name: (v) => text(v, 100) ?? 'IEG Colégio e Curso',
  email_team_name: (v) => text(v, 100) ?? 'Equipe de Cobrança',
  email_reply_to: (v) => {
    const s = String(v ?? '').trim().toLowerCase()
    if (!s) return null
    if (!isValidEmail(s)) throw new ApiError(422, 'E-mail de resposta inválido.')
    return s
  },
  email_provider: (v) => oneOf(v, ['smtp', 'resend'] as const, 'Provedor de e-mail'),
}

export const PUT = route(async (req: NextRequest) => {
  const user = await apiAuth(req, { admin: true })
  const body = await readJson<Record<string, unknown>>(req)
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    const validate = VALIDATORS[k as keyof Settings]
    if (!validate) continue
    update[k] = validate(v)
  }
  if (Object.keys(update).length === 0) throw new ApiError(400, 'Nada para salvar.')
  update.updated_at = new Date().toISOString()
  update.updated_by = user.id
  const db = createAdminClient()
  const before = normalizeSettings((await db.from('settings').select('*').eq('id', 1).maybeSingle()).data as Partial<Settings> | null)
  const { error } = await db.from('settings').update(update).eq('id', 1)
  if (error && /daily_interest_cents/.test(error.message)) {
    throw new ApiError(422, 'Para alterar o valor dos juros, rode antes no Supabase (SQL Editor) o arquivo supabase/migrations/0002_juros_fixo.sql.')
  }
  if (error) throw new Error(error.message)
  await audit(user, 'configuracoes_alteradas', { entity: 'settings', details: { campos: Object.keys(update).filter((k) => !k.startsWith('updated_')) } })

  // Mudou a base do valor (valor cheio × com desconto): recalcula as cobranças já importadas
  let recalculadas: number | null = null
  if (update.amount_basis && update.amount_basis !== before.amount_basis) {
    recalculadas = await recalcStoredCharges(db, update.amount_basis as AmountBasis, (update.open_rule as OpenRule | undefined) ?? before.open_rule)
    await audit(user, 'valores_recalculados', { entity: 'settings', details: { base: update.amount_basis, cobrancas_alteradas: recalculadas } })
  }
  return json({ ok: true, recalculadas })
})
