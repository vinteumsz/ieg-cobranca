// Configurações administrativas (não confidenciais). Ficam na tabela `settings`.
// Campos de texto nulos no banco significam "usar o padrão" definido aqui.

import type { CpfDisplay } from './format'

export type OpenRule = 'sem_pagamento_ou_zerado' | 'sem_data_pagamento' | 'valor_pago_zerado' | 'pago_menor_que_liquido'
export type AmountBasis = 'liquido' | 'parcela'
export type WaMode = 'template' | 'texto'
export type EmailProvider = 'smtp' | 'resend'
export type SendMode = 'manual' | 'automatico'

export type Settings = {
  open_rule: OpenRule
  only_overdue: boolean
  grace_days: number
  amount_basis: AmountBasis
  daily_interest_pct: number | null
  fine_pct: number | null
  interest_start_date: string | null
  show_updated_values: boolean
  cpf_display: CpfDisplay
  store_original_pdf: boolean
  duplicate_window_days: number
  send_mode: SendMode
  test_mode: boolean
  test_phone: string | null
  test_email: string | null
  wa_mode: WaMode
  wa_template_name: string | null
  wa_template_language: string
  wa_template_body: string | null
  wa_template_params: string[] | null
  wa_text_template: string | null
  email_subject_template: string | null
  email_body_template: string | null
  email_sender_name: string
  email_team_name: string
  email_reply_to: string | null
  email_provider: EmailProvider
  updated_at?: string | null
}

export const OPEN_RULE_LABELS: Record<OpenRule, string> = {
  sem_pagamento_ou_zerado: 'Sem data de pagamento OU valor pago zerado (padrão)',
  sem_data_pagamento: 'Somente quando não há data de pagamento',
  valor_pago_zerado: 'Somente quando o valor pago está zerado ou vazio',
  pago_menor_que_liquido: 'Valor pago menor que o devido (inclui pagamentos parciais)',
}

export const DEFAULT_WA_TEXT = `Olá, {{nome_responsavel}}. Tudo bem?

Aqui é da equipe de cobrança do IEG Colégio e Curso.

Identificamos mensalidades em aberto referentes ao aluno(a) {{nome_aluno}}.
{{linha_cpf}}

Mensalidades pendentes:
{{lista_mensalidades}}

Valor total identificado: {{valor_total}}
{{detalhe_atualizacao}}

Informamos que os valores estão sujeitos à atualização, pois os juros são calculados diariamente até a regularização.

Caso o pagamento já tenha sido realizado, pedimos a gentileza de desconsiderar esta mensagem ou encaminhar o comprovante para que possamos realizar a conferência.

Em caso de dúvidas ou para negociação, estamos à disposição.

Atenciosamente,
{{nome_equipe}}
IEG Colégio e Curso`

/** Texto sugerido para cadastrar o modelo (template) na Meta. Variáveis posicionais. */
export const DEFAULT_WA_TEMPLATE_BODY = `Olá, {{1}}. Tudo bem?

Aqui é da equipe de cobrança do IEG Colégio e Curso.

Identificamos mensalidades em aberto referentes ao aluno(a) {{2}}.

Mensalidades pendentes: {{3}}

Valor total identificado: {{4}}

Informamos que os valores estão sujeitos à atualização, pois os juros são calculados diariamente até a regularização.

Caso o pagamento já tenha sido realizado, pedimos a gentileza de desconsiderar esta mensagem ou encaminhar o comprovante para que possamos realizar a conferência.

Em caso de dúvidas ou para negociação, estamos à disposição.

Atenciosamente,
Equipe de Cobrança
IEG Colégio e Curso`

export const DEFAULT_WA_TEMPLATE_PARAMS = ['nome_responsavel', 'nome_aluno', 'lista_mensalidades_linha', 'valor_total']

export const DEFAULT_EMAIL_SUBJECT = 'Pendência financeira – IEG Colégio e Curso – {{nome_aluno}}'

export const DEFAULT_EMAIL_BODY = `Olá, {{nome_responsavel}}.

Este contato está sendo realizado pela equipe de cobrança do IEG Colégio e Curso.

Identificamos mensalidades em aberto vinculadas ao aluno(a):

{{nome_aluno}}
{{linha_cpf}}

Mensalidades pendentes:

{{lista_mensalidades}}

Total identificado:
{{valor_total}}
{{detalhe_atualizacao}}

Os valores estão sujeitos à atualização, pois os juros são calculados diariamente até a regularização.

Caso o pagamento já tenha sido realizado, solicitamos que desconsidere esta mensagem ou encaminhe o comprovante para conferência.

Para informações, negociação ou regularização dos valores, entre em contato com a equipe financeira do IEG Colégio e Curso.

Atenciosamente,

{{nome_equipe}}
IEG Colégio e Curso`

export const DEFAULT_SETTINGS: Settings = {
  open_rule: 'sem_pagamento_ou_zerado',
  only_overdue: true,
  grace_days: 0,
  amount_basis: 'parcela',
  daily_interest_pct: null,
  fine_pct: null,
  interest_start_date: null,
  show_updated_values: true,
  cpf_display: 'parcial',
  store_original_pdf: false,
  duplicate_window_days: 7,
  send_mode: 'manual',
  test_mode: true,
  test_phone: null,
  test_email: null,
  wa_mode: 'template',
  wa_template_name: null,
  wa_template_language: 'pt_BR',
  wa_template_body: null,
  wa_template_params: null,
  wa_text_template: null,
  email_subject_template: null,
  email_body_template: null,
  email_sender_name: 'IEG Colégio e Curso',
  email_team_name: 'Equipe de Cobrança',
  email_reply_to: null,
  email_provider: 'smtp',
}

/** Valores efetivos (com padrões aplicados aos campos de texto vazios). */
export function effective(s: Settings) {
  return {
    ...s,
    waText: s.wa_text_template?.trim() || DEFAULT_WA_TEXT,
    waTemplateBody: s.wa_template_body?.trim() || DEFAULT_WA_TEMPLATE_BODY,
    waTemplateParams: s.wa_template_params?.length ? s.wa_template_params : DEFAULT_WA_TEMPLATE_PARAMS,
    emailSubject: s.email_subject_template?.trim() || DEFAULT_EMAIL_SUBJECT,
    emailBody: s.email_body_template?.trim() || DEFAULT_EMAIL_BODY,
  }
}

export type EffectiveSettings = ReturnType<typeof effective>

/**
 * Cálculo de juros e multa (Configurações → Juros e multa). Com `false`, nada é calculado
 * mesmo com taxas salvas e a seção some das Configurações.
 */
export const INTEREST_ENABLED = true

export function normalizeSettings(row: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(row ?? {}) } as Settings
  s.daily_interest_pct = !INTEREST_ENABLED || s.daily_interest_pct === null || s.daily_interest_pct === undefined ? null : Number(s.daily_interest_pct)
  s.fine_pct = !INTEREST_ENABLED || s.fine_pct === null || s.fine_pct === undefined ? null : Number(s.fine_pct)
  if (!INTEREST_ENABLED) s.interest_start_date = null
  return s
}
