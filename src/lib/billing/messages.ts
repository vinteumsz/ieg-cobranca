// Montagem das mensagens de cobrança a partir dos modelos configurados.

import { cpfForMessage, firstName, formatCents, formatDateBR, SCHOOL_NAME, type CpfDisplay } from '../format'
import { computeDebtUpdate, type InterestSettings } from './interest'
import type { Installment } from './rules'

export type MessageCharge = {
  guardian_name: string
  guardian_cpf: string | null
  student_name: string
  class_name: string | null
  installments: Installment[]
  total_open_cents: number
}

export type MessageContext = InterestSettings & {
  cpf_display: CpfDisplay
  show_updated_values: boolean
  email_team_name: string
  today: string
}

export const TEMPLATE_VARIABLES: { name: string; description: string }[] = [
  { name: 'nome_responsavel', description: 'Nome completo do responsável' },
  { name: 'primeiro_nome_responsavel', description: 'Primeiro nome do responsável' },
  { name: 'nome_aluno', description: 'Nome do aluno(a)' },
  { name: 'turma', description: 'Turma do aluno' },
  { name: 'lista_mensalidades', description: 'Uma mensalidade por linha (Abril/2026 – R$ 543,00)' },
  { name: 'lista_mensalidades_linha', description: 'Mensalidades numa linha só (para modelo do WhatsApp)' },
  { name: 'quantidade_parcelas', description: 'Quantidade de parcelas em aberto' },
  { name: 'valor_total', description: 'Soma das parcelas em aberto' },
  { name: 'detalhe_atualizacao', description: 'Multa, juros e valor atualizado até hoje (vazio se não houver taxas)' },
  { name: 'valor_atualizado', description: 'Valor com multa e juros até hoje (igual ao total se não houver taxas)' },
  { name: 'data_atualizacao', description: 'Data do cálculo' },
  { name: 'linha_cpf', description: 'Linha com o CPF do responsável, conforme a configuração (ou vazio)' },
  { name: 'cpf_responsavel', description: 'CPF conforme a configuração (parcial, completo ou vazio)' },
  { name: 'nome_equipe', description: 'Nome da equipe (Configurações → E-mail)' },
  { name: 'nome_escola', description: SCHOOL_NAME },
]

function installmentLabel(i: Installment, all: Installment[]): string {
  const sameMonth = all.filter((o) => o.mes === i.mes).length > 1
  return sameMonth && i.receita ? `${i.mes} (${i.receita})` : i.mes
}

const monthIndex = (iso: string) => parseInt(iso.slice(0, 4), 10) * 12 + parseInt(iso.slice(5, 7), 10) - 1

/**
 * Versão em uma linha (parâmetro de modelo do WhatsApp). Sequências de 4+ meses seguidos
 * com o mesmo valor viram um intervalo: "Janeiro a Setembro/2026 (9 × R$ 580,00)".
 */
export function compactInstallmentList(charged: Installment[]): string {
  const items = [...charged].sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  const parts: string[] = []
  let i = 0
  while (i < items.length) {
    let j = i
    while (
      j + 1 < items.length &&
      monthIndex(items[j + 1].vencimento) === monthIndex(items[j].vencimento) + 1 &&
      items[j + 1].emAbertoCents === items[i].emAbertoCents &&
      items[j + 1].receita === items[i].receita
    ) j++
    const run = items.slice(i, j + 1)
    if (run.length >= 4) {
      const [m1, y1] = run[0].mes.split('/')
      const [m2, y2] = run[run.length - 1].mes.split('/')
      const range = y1 === y2 ? `${m1} a ${m2}/${y2}` : `${m1}/${y1} a ${m2}/${y2}`
      parts.push(`${range} (${run.length} × ${formatCents(run[0].emAbertoCents)})`)
    } else {
      for (const it of run) parts.push(`${installmentLabel(it, items)} – ${formatCents(it.emAbertoCents)}`)
    }
    i = j + 1
  }
  return parts.join('; ')
}

export function buildVariables(charge: MessageCharge, ctx: MessageContext): Record<string, string> {
  const charged = charge.installments.filter((i) => i.cobrar)
  const lista = charged.map((i) => `${installmentLabel(i, charged)} – ${formatCents(i.emAbertoCents)}`)
  const update = computeDebtUpdate(charge.installments, ctx, ctx.today)
  const cpf = cpfForMessage(charge.guardian_cpf, ctx.cpf_display)

  let detalhe = ''
  if (update.configured && ctx.show_updated_values) {
    // O valor original já aparece em {{valor_total}} logo acima nos modelos padrão
    const pct = (n: number) => `${String(n).replace('.', ',')}%`
    const rows: string[] = []
    if (update.fineCents > 0) rows.push(`Multa (${pct(ctx.fine_pct!)}): ${formatCents(update.fineCents)}`)
    if (ctx.daily_interest_cents) rows.push(`Juros (${formatCents(ctx.daily_interest_cents)} por dia): ${formatCents(update.interestCents)}`)
    rows.push(`Valor atualizado em ${formatDateBR(update.date)}: ${formatCents(update.updatedCents)}`)
    detalhe = '\n' + rows.join('\n')
  }

  return {
    nome_responsavel: charge.guardian_name,
    primeiro_nome_responsavel: firstName(charge.guardian_name),
    nome_aluno: charge.student_name,
    turma: charge.class_name ?? '',
    lista_mensalidades: lista.join('\n'),
    lista_mensalidades_linha: compactInstallmentList(charged),
    quantidade_parcelas: String(charged.length),
    valor_total: formatCents(update.originalCents),
    detalhe_atualizacao: detalhe,
    valor_atualizado: formatCents(update.updatedCents),
    data_atualizacao: formatDateBR(update.date),
    linha_cpf: cpf ? `CPF do responsável: ${cpf}` : '',
    cpf_responsavel: cpf,
    nome_equipe: ctx.email_team_name || 'Equipe de Cobrança',
    nome_escola: SCHOOL_NAME,
  }
}

/** Substitui {{variavel}} e limpa linhas vazias que sobraram. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const out = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, name: string) => (name in vars ? vars[name] : m))
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Variáveis desconhecidas que ficaram no texto (provável erro de digitação no modelo). */
export function unknownVariables(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))]
}

/** Parâmetros de modelo do WhatsApp não podem ter quebras de linha, tabulações ou 4+ espaços seguidos. */
export function sanitizeTemplateParam(v: string): string {
  return v.replace(/\s+/g, ' ').trim() || '-'
}

/** Preenche o corpo do modelo da Meta ({{1}}, {{2}}…) para a prévia. */
export function renderMetaTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => params[parseInt(n, 10) - 1] ?? m)
}

export function templateParamValues(paramNames: string[], vars: Record<string, string>): string[] {
  return paramNames.map((n) => sanitizeTemplateParam(vars[n] ?? ''))
}

export const textToHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

export function emailHtml(bodyText: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f5f3;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e1">
<tr><td style="height:6px;background:#FF6B00;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:bold;color:#1a1a1a">${SCHOOL_NAME}</td></tr>
<tr><td style="padding:8px 28px 20px;font-size:15px;line-height:1.55">${textToHtml(bodyText)}</td></tr>
<tr><td style="padding:14px 28px;background:#f6f5f3;font-size:12px;color:#5b5b5b">Mensagem enviada pela equipe financeira do ${SCHOOL_NAME}.</td></tr>
</table></td></tr></table></body></html>`
}
