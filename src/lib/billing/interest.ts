// Atualização da dívida (multa + juros diários simples), como no boleto da escola:
//  • multa única, a partir do dia seguinte ao vencimento (ex.: 2% de R$ 590,00 = R$ 11,80)
//  • juros por dia de atraso, com o valor diário em centavos calculado antes de multiplicar
//    pelos dias (ex.: 0,033% de R$ 590,00 = R$ 0,19 por dia)
//  • centavos sempre arredondados para baixo, para nunca cobrar a mais que o boleto
// Base: o valor em aberto de cada parcela (valor cheio). Sem taxas informadas, NADA é
// calculado — apenas o aviso de atualização é exibido.

import { daysBetween } from '../format'
import type { Installment } from './rules'

export type InterestSettings = {
  daily_interest_pct: number | null
  fine_pct: number | null
  interest_start_date: string | null
}

export type DebtUpdate = {
  configured: boolean
  originalCents: number
  fineCents: number
  interestCents: number
  updatedCents: number
  date: string
}

// pequeno ajuste para erros de ponto flutuante (ex.: 1180,0000000002 → 1180)
const floorCents = (v: number) => Math.floor(v + 1e-6)

/** Multa em centavos sobre o valor da parcela. */
export function fineFor(baseCents: number, finePct: number | null): number {
  return finePct ? floorCents((baseCents * finePct) / 100) : 0
}

/** Juros de um dia de atraso, em centavos. */
export function dailyInterestFor(baseCents: number, dailyPct: number | null): number {
  return dailyPct ? floorCents((baseCents * dailyPct) / 100) : 0
}

export function isInterestConfigured(s: InterestSettings): boolean {
  return (s.daily_interest_pct !== null && s.daily_interest_pct > 0) || (s.fine_pct !== null && s.fine_pct > 0)
}

export function computeDebtUpdate(installments: Installment[], s: InterestSettings, today: string): DebtUpdate {
  const charged = installments.filter((i) => i.cobrar)
  const originalCents = charged.reduce((sum, i) => sum + i.emAbertoCents, 0)
  if (!isInterestConfigured(s)) {
    return { configured: false, originalCents, fineCents: 0, interestCents: 0, updatedCents: originalCents, date: today }
  }
  const start = s.interest_start_date
  let fineCents = 0
  let interestCents = 0
  for (const i of charged) {
    const from = start && start > i.vencimento ? start : i.vencimento
    const days = Math.max(0, daysBetween(from, today))
    const overdue = daysBetween(i.vencimento, today) > 0 && (!start || today >= start)
    if (overdue) fineCents += fineFor(i.emAbertoCents, s.fine_pct)
    if (days > 0) interestCents += dailyInterestFor(i.emAbertoCents, s.daily_interest_pct) * days
  }
  return { configured: true, originalCents, fineCents, interestCents, updatedCents: originalCents + fineCents + interestCents, date: today }
}
