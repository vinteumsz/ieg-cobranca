import 'server-only'
import type { SessionUser } from '../auth'
import { displayUser } from '../auth'
import { composeMessages, toComposeSettings } from '../billing/compose'
import { emailHtml } from '../billing/messages'
import { hasCritical } from '../billing/rules'
import { loadSettings, recentDispatches } from '../data'
import { env } from '../env'
import { formatPhone, isValidEmail, parseBrPhone, todayISO } from '../format'
import { getSecrets } from '../secrets'
import { effective, type Settings } from '../settings'
import { createAdminClient } from '../supabase/server'
import type { ChannelStatus, ChargeRow } from '../types'
import { emailConfigProblem, sendEmail, type EmailConfig } from './email'
import { sendWhatsApp, type WaConfig } from './whatsapp'

export type Channel = 'whatsapp' | 'email'

export type ChannelReadiness = { ok: boolean; reason?: string; simulate?: boolean }

type Ctx = {
  settings: Settings
  waConfig: WaConfig
  emailConfig: EmailConfig
  testPhone: string
  testEmail: string
}

async function loadContext(): Promise<Ctx> {
  const settings = await loadSettings()
  const sec = await getSecrets()
  return {
    settings,
    waConfig: { phoneNumberId: sec.wa_phone_number_id, token: sec.wa_access_token, graphVersion: env.graphVersion },
    emailConfig: {
      provider: settings.email_provider,
      fromAddress: sec.email_from_address,
      fromName: settings.email_sender_name || 'IEG Colégio e Curso',
      replyTo: settings.email_reply_to,
      smtp: { host: sec.smtp_host, port: Number(sec.smtp_port) || 587, user: sec.smtp_user, pass: sec.smtp_password },
      resendKey: sec.resend_api_key,
    },
    testPhone: parseBrPhone(settings.test_phone).e164,
    testEmail: isValidEmail(settings.test_email) ? settings.test_email!.trim() : '',
  }
}

function readiness(ctx: Ctx): Record<Channel, ChannelReadiness> {
  const s = ctx.settings
  const waProblem =
    !ctx.waConfig.phoneNumberId || !ctx.waConfig.token
      ? 'WhatsApp não configurado (Phone Number ID e token).'
      : s.wa_mode === 'template' && !s.wa_template_name
        ? 'Informe o nome do modelo aprovado na Meta (Configurações → WhatsApp).'
        : null
  const emailProblem = emailConfigProblem(ctx.emailConfig)
  if (s.test_mode) {
    return {
      // Em modo de testes: envia ao número/e-mail de teste se houver; senão só simula.
      whatsapp: ctx.testPhone && !waProblem ? { ok: true } : { ok: true, simulate: true },
      email: ctx.testEmail && !emailProblem ? { ok: true } : { ok: true, simulate: true },
    }
  }
  return {
    whatsapp: waProblem ? { ok: false, reason: waProblem } : { ok: true },
    email: emailProblem ? { ok: false, reason: emailProblem } : { ok: true },
  }
}

// ─── Pré-checagem (antes da janela de confirmação) ─────────────────────────

export type PreflightItem = {
  id: string
  guardian_name: string
  student_name: string
  total_open_cents: number
  phone: boolean
  email: boolean
  blocked: null | 'cancelada' | 'alerta'
  lastSentAt: string | null
}

export async function preflight(chargeIds: string[]) {
  const ctx = await loadContext()
  const { data, error } = await createAdminClient()
    .from('charges')
    .select('id, group_key, guardian_name, student_name, total_open_cents, guardian_phone, guardian_email, status, warnings, reviewed')
    .in('id', chargeIds)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Pick<ChargeRow, 'id' | 'group_key' | 'guardian_name' | 'student_name' | 'total_open_cents' | 'guardian_phone' | 'guardian_email' | 'status' | 'warnings' | 'reviewed'>[]
  const recent = await recentDispatches([...new Set(rows.map((r) => r.group_key))], ctx.settings.duplicate_window_days)
  const items: PreflightItem[] = rows.map((r) => ({
    id: r.id,
    guardian_name: r.guardian_name,
    student_name: r.student_name,
    total_open_cents: r.total_open_cents,
    phone: !!r.guardian_phone,
    email: !!r.guardian_email,
    blocked: r.status === 'cancelado' ? 'cancelada' : hasCritical(r.warnings) && !r.reviewed ? 'alerta' : null,
    lastSentAt: recent.get(r.group_key) ?? null,
  }))
  return {
    items,
    ready: readiness(ctx),
    testMode: ctx.settings.test_mode,
    testTargets: { whatsapp: ctx.testPhone ? formatPhone(ctx.testPhone) : null, email: ctx.testEmail || null },
    windowDays: ctx.settings.duplicate_window_days,
  }
}

// ─── Envio ─────────────────────────────────────────────────────────────────

export type ChannelResult = { status: ChannelStatus | 'sem_contato' | 'ignorado'; error?: string; recipient?: string }
export type ChargeResult = {
  chargeId: string
  skipped?: 'cancelada' | 'alerta' | 'duplicada' | 'ja_processada' | 'nao_encontrada'
  lastSentAt?: string
  whatsapp?: ChannelResult
  email?: ChannelResult
}

export async function sendCharges(opts: {
  user: SessionUser
  batchId: string
  chargeIds: string[]
  channels: Channel[]
  allowResend: string[]
}): Promise<ChargeResult[]> {
  const ctx = await loadContext()
  const ready = readiness(ctx)
  const s = ctx.settings
  const today = todayISO()
  const compose = toComposeSettings(effective(s), today)
  const db = createAdminClient()

  const { data, error } = await db.from('charges').select('*').in('id', opts.chargeIds)
  if (error) throw new Error(error.message)
  const charges = (data ?? []) as ChargeRow[]
  const recent = await recentDispatches([...new Set(charges.map((c) => c.group_key))], s.duplicate_window_days)
  const results: ChargeResult[] = []

  for (const id of opts.chargeIds) {
    const charge = charges.find((c) => c.id === id)
    if (!charge) {
      results.push({ chargeId: id, skipped: 'nao_encontrada' })
      continue
    }
    if (charge.status === 'cancelado') {
      results.push({ chargeId: id, skipped: 'cancelada' })
      continue
    }
    if (hasCritical(charge.warnings) && !charge.reviewed) {
      results.push({ chargeId: id, skipped: 'alerta' })
      continue
    }
    const last = recent.get(charge.group_key)
    if (last && !opts.allowResend.includes(id)) {
      results.push({ chargeId: id, skipped: 'duplicada', lastSentAt: last })
      continue
    }

    const composed = composeMessages(charge, compose)
    const { data: dispatch, error: dErr } = await db
      .from('dispatches')
      .insert({
        batch_id: opts.batchId,
        charge_id: charge.id,
        import_id: charge.import_id,
        group_key: charge.group_key,
        guardian_name: charge.guardian_name,
        guardian_cpf: charge.guardian_cpf,
        student_name: charge.student_name,
        amount_cents: charge.total_open_cents,
        channels: opts.channels,
        status: 'pendente',
        test_mode: s.test_mode,
        sent_by: opts.user.id,
        sent_by_name: displayUser(opts.user),
      })
      .select('id')
      .single()
    if (dErr || !dispatch) {
      // (batch_id, charge_id) repetido = clique duplo / reenvio do mesmo lote
      results.push({ chargeId: id, skipped: 'ja_processada' })
      continue
    }

    const result: ChargeResult = { chargeId: id }
    const update: Partial<ChargeRow> = {}

    for (const channel of opts.channels) {
      const realTarget = channel === 'whatsapp' ? charge.guardian_phone : charge.guardian_email
      if (!realTarget) {
        result[channel] = { status: 'sem_contato' }
        continue
      }
      const r = ready[channel]
      if (!r.ok) {
        result[channel] = { status: 'erro', error: r.reason }
        continue
      }
      const target = s.test_mode ? (channel === 'whatsapp' ? ctx.testPhone : ctx.testEmail) : realTarget
      const body = channel === 'whatsapp' ? composed.whatsapp.preview : composed.email.body

      // Libera envios que ficaram presos (queda de conexão no meio do processo)
      await db
        .from('messages')
        .update({ status: 'erro', error_message: 'Envio interrompido antes da confirmação.' })
        .eq('charge_id', charge.id)
        .eq('channel', channel)
        .eq('status', 'pendente')
        .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())

      const { data: msg, error: mErr } = await db
        .from('messages')
        .insert({
          dispatch_id: dispatch.id,
          charge_id: charge.id,
          channel,
          recipient: r.simulate ? realTarget : target,
          intended_recipient: s.test_mode ? realTarget : null,
          subject: channel === 'email' ? composed.email.subject : null,
          body,
          status: 'pendente',
          provider: channel === 'whatsapp' ? 'meta_cloud_api' : s.email_provider,
        })
        .select('id')
        .single()
      if (mErr || !msg) {
        result[channel] = { status: 'ignorado', error: 'Já existe um envio em andamento para esta cobrança.' }
        continue
      }

      let status: ChannelStatus
      let providerId: string | null = null
      let errorMsg: string | null = null
      if (r.simulate) {
        status = 'simulado'
      } else {
        const sent =
          channel === 'whatsapp'
            ? await sendWhatsApp(
                ctx.waConfig,
                target!,
                composed.whatsapp.mode === 'template'
                  ? { mode: 'template', templateName: composed.whatsapp.templateName!, language: composed.whatsapp.language, params: composed.whatsapp.params }
                  : { mode: 'texto', text: composed.whatsapp.text },
              )
            : await sendEmail(ctx.emailConfig, target!, composed.email.subject, composed.email.body, emailHtml(composed.email.body))
        if (sent.ok) {
          status = s.test_mode ? 'simulado' : 'enviado'
          providerId = sent.id
        } else {
          status = 'erro'
          errorMsg = sent.error
        }
      }

      await db
        .from('messages')
        .update({ status, provider_message_id: providerId, error_message: errorMsg, sent_at: status === 'erro' ? null : new Date().toISOString() })
        .eq('id', msg.id)

      result[channel] = { status, error: errorMsg ?? undefined, recipient: s.test_mode ? (r.simulate ? 'simulação' : target!) : target! }
      if (channel === 'whatsapp') update.wa_status = status
      else update.email_status = status
    }

    const statuses = opts.channels.map((c) => result[c]?.status).filter((x): x is ChannelResult['status'] => !!x)
    const real = statuses.filter((x) => x === 'enviado')
    const sim = statuses.filter((x) => x === 'simulado')
    const errs = statuses.filter((x) => x === 'erro')
    const dispatchStatus = real.length ? 'enviado' : sim.length ? 'simulado' : errs.length ? 'erro' : 'cancelado'

    await db
      .from('dispatches')
      .update({
        status: dispatchStatus,
        note: dispatchStatus === 'cancelado' ? 'Sem contato para os canais escolhidos.' : null,
      })
      .eq('id', dispatch.id)

    if (real.length) {
      update.status = charge.status === 'entregue' ? 'entregue' : 'enviado'
      update.last_sent_at = new Date().toISOString()
    } else if (errs.length && !sim.length && charge.status === 'pendente') {
      update.status = 'erro'
    }
    if (Object.keys(update).length) await db.from('charges').update(update).eq('id', charge.id)
    results.push(result)
  }
  return results
}

// ─── Envio de teste (Configurações) ────────────────────────────────────────

export async function sendTest(channel: Channel, to: string) {
  const ctx = await loadContext()
  const s = ctx.settings
  if (channel === 'whatsapp') {
    const phone = parseBrPhone(to).e164
    if (!phone) return { ok: false as const, error: 'Número de celular inválido.' }
    if (!ctx.waConfig.phoneNumberId || !ctx.waConfig.token) return { ok: false as const, error: 'WhatsApp não configurado.' }
    if (s.wa_mode === 'template') {
      if (!s.wa_template_name) return { ok: false as const, error: 'Informe o nome do modelo aprovado.' }
      const eff = effective(s)
      const params = eff.waTemplateParams.map((p) =>
        ({ nome_responsavel: 'Teste', primeiro_nome_responsavel: 'Teste', nome_aluno: 'Aluno Teste', lista_mensalidades_linha: 'Abril/2026 – R$ 1,00', valor_total: 'R$ 1,00' } as Record<string, string>)[p] ?? 'teste',
      )
      return sendWhatsApp(ctx.waConfig, phone, { mode: 'template', templateName: s.wa_template_name, language: s.wa_template_language, params })
    }
    return sendWhatsApp(ctx.waConfig, phone, { mode: 'texto', text: 'Mensagem de teste do sistema IEG Cobrança.' })
  }
  if (!isValidEmail(to)) return { ok: false as const, error: 'E-mail inválido.' }
  const text = 'Este é um e-mail de teste do sistema IEG Cobrança. Se você recebeu, a configuração de e-mail está funcionando.'
  return sendEmail(ctx.emailConfig, to.trim(), 'Teste – IEG Cobrança', text, emailHtml(text))
}
