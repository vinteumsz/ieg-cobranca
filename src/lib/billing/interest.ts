// Atualização da dívida (multa + juros diários simples), reproduzindo o sistema da escola:
//  • base: o valor em aberto de cada parcela (valor cheio)
//  • multa única de X% (ex.: 2% de R$ 563,00 = R$ 11,26)
//  • juros com valor fixo por dia de atraso, igual para qualquer parcela (R$ 0,19)
//  • os dias de atraso contam a partir do primeiro dia útil (segunda a sexta) depois do
//    vencimento, incluindo esse dia: vencimento na quinta → conta desde sexta; vencimento
//    na sexta, no sábado ou no domingo → conta desde segunda
// Conferido com o relatório do sistema da escola (parcelas de R$ 563,00 vencidas de fevereiro
// a setembro de 2026: todos os valores de multa, juros e total batem).
// Sem taxas informadas, NADA é calculado — apenas o aviso de atualização é exibido.

import { addDays, daysBetween } from '../format'
import type { Installment } from './rules'

export type InterestSettings = {
  /** Juros por dia de atraso, em centavos */
  daily_interest_cents: number | null
  fine_pct: number | null
  interest_start_date: string | null
}

export type DebtItem = {
  vencimento: string
  mes: string
  originalCents: number
  /** Dias de atraso considerados nos juros */
  days: number
  fineCents: number
  interestCents: number
  totalCents: number
}

export type DebtUpdate = {
  configured: boolean
  originalCents: number
  fineCents: number
  interestCents: number
  updatedCents: number
  date: string
  /** Detalhe por parcela cobrada (mesma ordem das parcelas) */
  items: DebtItem[]
}

// arredonda para o centavo, com uma folga para erros de ponto flutuante (18,4999999 → 18)
const roundCents = (v: number) => Math.round(v + 1e-9)

/** Multa em centavos sobre o valor da parcela. */
export function fineFor(baseCents: number, finePct: number | null): number {
  return finePct ? roundCents((baseCents * finePct) / 100) : 0
}

/** Primeiro dia útil (segunda a sexta) depois do vencimento: a partir dele há multa e juros. */
export function lateFrom(vencimento: string): string {
  let d = addDays(vencimento, 1)
  for (;;) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (dow !== 0 && dow !== 6) return d
    d = addDays(d, 1)
  }
}

/** Dias de atraso para os juros na data `today` (0 se ainda não está em atraso). */
export function lateDays(vencimento: string, today: string, startDate: string | null = null): number {
  let from = lateFrom(vencimento)
  if (startDate && startDate > from) from = startDate
  return today >= from ? daysBetween(from, today) + 1 : 0
}

export function isInterestConfigured(s: InterestSettings): boolean {
  return (s.daily_interest_cents !== null && s.daily_interest_cents > 0) || (s.fine_pct !== null && s.fine_pct > 0)
}

export function computeDebtUpdate(installments: Installment[], s: InterestSettings, today: string): DebtUpdate {
  const charged = installments.filter((i) => i.cobrar)
  const originalCents = charged.reduce((sum, i) => sum + i.emAbertoCents, 0)
  const configured = isInterestConfigured(s)
  const items: DebtItem[] = charged.map((i) => {
    const days = configured ? lateDays(i.vencimento, today, s.interest_start_date) : 0
    const fineCents = days > 0 ? fineFor(i.emAbertoCents, s.fine_pct) : 0
    const interestCents = days > 0 ? Math.round(s.daily_interest_cents ?? 0) * days : 0
    return { vencimento: i.vencimento, mes: i.mes, originalCents: i.emAbertoCents, days, fineCents, interestCents, totalCents: i.emAbertoCents + fineCents + interestCents }
  })
  const fineCents = items.reduce((sum, i) => sum + i.fineCents, 0)
  const interestCents = items.reduce((sum, i) => sum + i.interestCents, 0)
  return { configured, originalCents, fineCents, interestCents, updatedCents: originalCents + fineCents + interestCents, date: today, items }
}
