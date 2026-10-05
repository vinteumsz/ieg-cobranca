// Atualização da dívida (multa + juros diários simples).
// Se a escola não informou taxas, NADA é calculado — apenas o aviso de atualização é exibido.

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
    if (overdue && s.fine_pct) fineCents += Math.round((i.emAbertoCents * s.fine_pct) / 100)
    if (days > 0 && s.daily_interest_pct) interestCents += Math.round((i.emAbertoCents * s.daily_interest_pct * days) / 100)
  }
  return { configured: true, originalCents, fineCents, interestCents, updatedCents: originalCents + fineCents + interestCents, date: today }
}
