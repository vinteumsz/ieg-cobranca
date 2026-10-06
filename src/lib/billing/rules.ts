// Regras de cobrança: o que é parcela em aberto, quanto se cobra e como agrupar.

import {
  daysBetween, displayName, isValidCpf, isValidEmail, monthLabel, nameKey, onlyDigits, parseBrPhone, pickEmail,
} from '../format'
import type { RawInstallment, RawRecord } from '../pdf/types'
import type { AmountBasis, OpenRule } from '../settings'

export type Installment = {
  receita: string
  parcela: string
  vencimento: string
  mes: string
  valorParcelaCents: number | null
  descontoCents: number | null
  valorLiquidoCents: number | null
  dataPagamento: string | null
  valorPagoCents: number | null
  /** Valor considerado em aberto para esta parcela */
  emAbertoCents: number
  situacao: 'vencida' | 'a_vencer'
  /** Entra no total cobrado */
  cobrar: boolean
  avisos: string[]
}

export type WarningLevel = 'critico' | 'atencao'
export type ChargeWarning = { code: string; message: string; level: WarningLevel }

export type ChargeDraft = {
  group_key: string
  guardian_name: string
  guardian_cpf: string | null
  guardian_email: string | null
  guardian_phone: string | null
  guardian_phone_raw: string | null
  student_name: string
  class_name: string | null
  installments: Installment[]
  open_count: number
  upcoming_count: number
  total_open_cents: number
  oldest_due: string | null
  warnings: ChargeWarning[]
}

export type RuleSettings = {
  open_rule: OpenRule
  only_overdue: boolean
  grace_days: number
  amount_basis: AmountBasis
}

export type ImportStats = {
  alunosLidos: number
  responsaveis: number
  cobrancas: number
  parcelasCobradas: number
  parcelasAVencer: number
  totalCents: number
  alunosSemPendencia: number
  comAlertaCritico: number
  semWhatsapp: number
  semEmail: number
}

type Amounts = Pick<RawInstallment, 'valorParcelaCents' | 'valorLiquidoCents' | 'valorPagoCents'>

/**
 * Valor de referência da parcela. Padrão da escola: o VALOR CHEIO da parcela (sem desconto)
 * é o valor do débito. "liquido" usa o valor com desconto, se a escola mudar a regra.
 */
function baseAmount(r: Amounts, basis: AmountBasis): number | null {
  return basis === 'parcela' ? (r.valorParcelaCents ?? r.valorLiquidoCents) : (r.valorLiquidoCents ?? r.valorParcelaCents)
}

/** Quanto está em aberto numa parcela já considerada em aberto. */
export function openAmount(r: Amounts, rules: Pick<RuleSettings, 'open_rule' | 'amount_basis'>): number | null {
  const base = baseAmount(r, rules.amount_basis)
  if (base === null) return null
  return rules.open_rule === 'pago_menor_que_liquido' ? Math.max(0, base - (r.valorPagoCents ?? 0)) : base
}

export function isOpenInstallment(r: RawInstallment, rule: OpenRule): boolean {
  const pago = r.valorPagoCents
  const paidZero = pago === 0 || (pago === null && !r.dataPagamento)
  switch (rule) {
    case 'sem_data_pagamento':
      return !r.dataPagamento
    case 'valor_pago_zerado':
      return paidZero
    case 'pago_menor_que_liquido': {
      // Quem pagou pelo menos o valor com desconto quitou a parcela (pagamento em dia).
      // Abaixo disso é pagamento parcial; o que falta é calculado sobre a base escolhida.
      const due = r.valorLiquidoCents ?? r.valorParcelaCents
      if (due === null) return !r.dataPagamento
      return (pago ?? 0) < due
    }
    case 'sem_pagamento_ou_zerado':
    default:
      return !r.dataPagamento || paidZero
  }
}

export function groupKeyFor(cpf: string, responsavel: string, aluno: string): string {
  const who = onlyDigits(cpf).length === 11 ? onlyDigits(cpf) : nameKey(responsavel)
  return `${who}|${nameKey(aluno)}`
}

const instKey = (r: RawInstallment) =>
  [nameKey(r.receita), r.parcela, r.vencimento, r.valorParcelaCents, r.valorLiquidoCents].join('|')

export function buildCharges(records: RawRecord[], rules: RuleSettings, today: string): { charges: ChargeDraft[]; stats: ImportStats } {
  // 1) Agrupa por responsável + aluno (blocos repetidos em quebras de página são unidos)
  const groups = new Map<string, { rec: RawRecord; parcelas: RawInstallment[]; avisos: string[] }>()
  for (const rec of records) {
    const key = groupKeyFor(rec.cpf, rec.responsavel, rec.aluno)
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { rec: { ...rec }, parcelas: [...rec.parcelas], avisos: [...rec.avisos] })
      continue
    }
    const seen = new Set(g.parcelas.map(instKey))
    for (const p of rec.parcelas) if (!seen.has(instKey(p))) g.parcelas.push(p)
    g.rec.email ||= rec.email
    g.rec.celular ||= rec.celular
    g.rec.turma ||= rec.turma
    for (const a of rec.avisos) if (!g.avisos.includes(a)) g.avisos.push(a)
  }

  const charges: ChargeDraft[] = []
  let alunosSemPendencia = 0
  let parcelasAVencer = 0

  for (const [key, { rec, parcelas, avisos }] of groups) {
    const installments: Installment[] = []
    const warnings: ChargeWarning[] = []

    for (const p of parcelas) {
      if (!isOpenInstallment(p, rules.open_rule)) continue
      const base = openAmount(p, rules)
      const emAberto = base ?? 0
      const vencida = daysBetween(p.vencimento, today) > rules.grace_days
      const cobrar = vencida || !rules.only_overdue
      const avisosParcela = [...p.avisos]
      if (base === null) avisosParcela.push('Não foi possível ler o valor desta parcela.')
      installments.push({
        receita: p.receita,
        parcela: p.parcela,
        vencimento: p.vencimento,
        mes: monthLabel(p.vencimento),
        valorParcelaCents: p.valorParcelaCents,
        descontoCents: p.descontoCents,
        valorLiquidoCents: p.valorLiquidoCents,
        dataPagamento: p.dataPagamento,
        valorPagoCents: p.valorPagoCents,
        emAbertoCents: emAberto,
        situacao: vencida ? 'vencida' : 'a_vencer',
        cobrar,
        avisos: avisosParcela,
      })
    }
    installments.sort((a, b) => a.vencimento.localeCompare(b.vencimento))

    const charged = installments.filter((i) => i.cobrar)
    const upcoming = installments.filter((i) => !i.cobrar)
    parcelasAVencer += upcoming.length
    if (charged.length === 0) {
      alunosSemPendencia++
      continue
    }

    // 2) Avisos para conferência humana
    if (!rec.responsavel) warnings.push({ code: 'sem_responsavel', level: 'critico', message: 'Responsável não identificado no relatório.' })
    if (!rec.aluno) warnings.push({ code: 'sem_aluno', level: 'critico', message: 'Aluno não identificado no relatório.' })
    for (const a of avisos) {
      const critical = /mesmo do aluno anterior/.test(a)
      warnings.push({ code: critical ? 'responsavel_herdado' : 'aviso_leitura', level: critical ? 'critico' : 'atencao', message: a })
    }

    const cpf = onlyDigits(rec.cpf)
    if (!cpf) warnings.push({ code: 'sem_cpf', level: 'atencao', message: 'CPF do responsável não encontrado.' })
    else if (!isValidCpf(cpf)) warnings.push({ code: 'cpf_invalido', level: 'atencao', message: 'CPF do responsável parece inválido (dígitos não conferem).' })

    const phone = parseBrPhone(rec.celular)
    if (phone.kind === 'ausente') warnings.push({ code: 'sem_celular', level: 'atencao', message: 'Sem celular: não será possível enviar WhatsApp.' })
    else if (phone.kind === 'fixo') warnings.push({ code: 'telefone_fixo', level: 'atencao', message: 'O telefone parece ser fixo; WhatsApp não será enviado.' })
    else if (phone.kind === 'invalido') warnings.push({ code: 'celular_invalido', level: 'atencao', message: `Celular em formato não reconhecido: "${rec.celular}".` })
    else if (phone.ninthDigitAdded) warnings.push({ code: 'nono_digito', level: 'atencao', message: 'O celular tinha 8 dígitos; o 9 foi acrescentado. Confira o número.' })

    const email = pickEmail(rec.email)
    if (!rec.email.trim()) warnings.push({ code: 'sem_email', level: 'atencao', message: 'Sem e-mail cadastrado.' })
    else if (!isValidEmail(email)) warnings.push({ code: 'email_invalido', level: 'atencao', message: `E-mail em formato não reconhecido: "${rec.email}".` })

    if (charged.some((i) => i.avisos.length > 0)) {
      warnings.push({ code: 'valores_inconsistentes', level: 'critico', message: 'Uma ou mais parcelas tiveram leitura duvidosa. Compare com o relatório.' })
    }

    charges.push({
      group_key: key,
      guardian_name: displayName(rec.responsavel),
      guardian_cpf: cpf || null,
      guardian_email: email || null,
      guardian_phone: phone.e164 || null,
      guardian_phone_raw: rec.celular || null,
      student_name: displayName(rec.aluno),
      class_name: rec.turma || null,
      installments,
      open_count: charged.length,
      upcoming_count: upcoming.length,
      total_open_cents: charged.reduce((s, i) => s + i.emAbertoCents, 0),
      oldest_due: charged[0]?.vencimento ?? null,
      warnings,
    })
  }

  // 3) Checagem cruzada: mesmo contato em responsáveis diferentes
  const who = (c: ChargeDraft) => c.guardian_cpf ?? nameKey(c.guardian_name)
  const byPhone = new Map<string, Set<string>>()
  const byEmail = new Map<string, Set<string>>()
  for (const c of charges) {
    if (c.guardian_phone) byPhone.set(c.guardian_phone, (byPhone.get(c.guardian_phone) ?? new Set()).add(who(c)))
    if (c.guardian_email) byEmail.set(c.guardian_email, (byEmail.get(c.guardian_email) ?? new Set()).add(who(c)))
  }
  for (const c of charges) {
    if (c.guardian_phone && byPhone.get(c.guardian_phone)!.size > 1) {
      c.warnings.push({ code: 'telefone_compartilhado', level: 'critico', message: 'Este celular aparece para outro responsável no mesmo relatório. Confira antes de enviar.' })
    }
    if (c.guardian_email && byEmail.get(c.guardian_email)!.size > 1) {
      c.warnings.push({ code: 'email_compartilhado', level: 'atencao', message: 'Este e-mail aparece para outro responsável no mesmo relatório.' })
    }
  }

  charges.sort((a, b) => a.guardian_name.localeCompare(b.guardian_name, 'pt-BR') || a.student_name.localeCompare(b.student_name, 'pt-BR'))

  const stats: ImportStats = {
    alunosLidos: groups.size,
    responsaveis: new Set(charges.map(who)).size,
    cobrancas: charges.length,
    parcelasCobradas: charges.reduce((s, c) => s + c.open_count, 0),
    parcelasAVencer,
    totalCents: charges.reduce((s, c) => s + c.total_open_cents, 0),
    alunosSemPendencia,
    comAlertaCritico: charges.filter((c) => c.warnings.some((w) => w.level === 'critico')).length,
    semWhatsapp: charges.filter((c) => !c.guardian_phone).length,
    semEmail: charges.filter((c) => !c.guardian_email).length,
  }
  return { charges, stats }
}

/**
 * Recalcula o valor em aberto de cobranças já gravadas (ex.: quando a base do valor muda
 * nas configurações). Quais parcelas estão em aberto não muda; só o valor de cada uma.
 */
export function recomputeOpenAmounts(installments: Installment[], rules: Pick<RuleSettings, 'open_rule' | 'amount_basis'>) {
  const next = installments.map((i) => ({ ...i, emAbertoCents: openAmount(i, rules) ?? 0 }))
  return { installments: next, total_open_cents: next.filter((i) => i.cobrar).reduce((s, i) => s + i.emAbertoCents, 0) }
}

export function hasCritical(warnings: ChargeWarning[] | null | undefined): boolean {
  return !!warnings?.some((w) => w.level === 'critico')
}
