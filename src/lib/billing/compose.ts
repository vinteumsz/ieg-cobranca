// Monta o conteúdo final de cada canal para uma cobrança (usado na prévia e no envio,
// garantindo que o que o funcionário vê é exatamente o que será enviado).

import type { CpfDisplay } from '../format'
import type { EffectiveSettings, WaMode } from '../settings'
import { computeDebtUpdate } from './interest'
import { buildVariables, renderMetaTemplate, renderTemplate, sanitizeTemplateParam, templateParamValues, type MessageCharge } from './messages'

export type ComposeSettings = {
  today: string
  cpf_display: CpfDisplay
  show_updated_values: boolean
  email_team_name: string
  daily_interest_cents: number | null
  fine_pct: number | null
  interest_start_date: string | null
  wa_mode: WaMode
  wa_template_name: string | null
  wa_template_language: string
  waText: string
  waTemplateBody: string
  waTemplateParams: string[]
  emailSubject: string
  emailBody: string
}

export function toComposeSettings(s: EffectiveSettings, today: string): ComposeSettings {
  return {
    today,
    cpf_display: s.cpf_display,
    show_updated_values: s.show_updated_values,
    email_team_name: s.email_team_name,
    daily_interest_cents: s.daily_interest_cents,
    fine_pct: s.fine_pct,
    interest_start_date: s.interest_start_date,
    // No envio manual o funcionário envia pelo próprio WhatsApp: vale o texto livre, sem modelo da Meta
    wa_mode: s.send_mode === 'manual' ? 'texto' : s.wa_mode,
    wa_template_name: s.wa_template_name,
    wa_template_language: s.wa_template_language,
    waText: s.waText,
    waTemplateBody: s.waTemplateBody,
    waTemplateParams: s.waTemplateParams,
    emailSubject: s.emailSubject,
    emailBody: s.emailBody,
  }
}

export type ComposableCharge = MessageCharge & {
  wa_text_override: string | null
  wa_params_override: string[] | null
  email_subject_override: string | null
  email_body_override: string | null
}

export type ComposedMessages = {
  whatsapp:
    | { mode: 'template'; templateName: string | null; language: string; params: string[]; preview: string; edited: boolean }
    | { mode: 'texto'; text: string; preview: string; edited: boolean }
  email: { subject: string; body: string; edited: boolean }
  update: ReturnType<typeof computeDebtUpdate>
  vars: Record<string, string>
}

export function composeMessages(charge: ComposableCharge, s: ComposeSettings): ComposedMessages {
  const vars = buildVariables(charge, s)
  const update = computeDebtUpdate(charge.installments, s, s.today)

  let whatsapp: ComposedMessages['whatsapp']
  if (s.wa_mode === 'template') {
    const useOverride = !!charge.wa_params_override && charge.wa_params_override.length === s.waTemplateParams.length
    const params = useOverride ? charge.wa_params_override!.map(sanitizeTemplateParam) : templateParamValues(s.waTemplateParams, vars)
    whatsapp = {
      mode: 'template',
      templateName: s.wa_template_name,
      language: s.wa_template_language,
      params,
      preview: renderMetaTemplate(s.waTemplateBody, params),
      edited: useOverride,
    }
  } else {
    const text = charge.wa_text_override?.trim() ? charge.wa_text_override : renderTemplate(s.waText, vars)
    whatsapp = { mode: 'texto', text, preview: text, edited: !!charge.wa_text_override?.trim() }
  }

  const subject = charge.email_subject_override?.trim() ? charge.email_subject_override : renderTemplate(s.emailSubject, vars)
  const body = charge.email_body_override?.trim() ? charge.email_body_override : renderTemplate(s.emailBody, vars)
  return {
    whatsapp,
    email: { subject, body, edited: !!(charge.email_subject_override?.trim() || charge.email_body_override?.trim()) },
    update,
    vars,
  }
}
