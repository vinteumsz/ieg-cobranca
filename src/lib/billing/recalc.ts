import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AmountBasis, OpenRule } from '../settings'
import type { ChargeWarning, ImportStats, Installment } from './rules'
import { hasCritical, recomputeOpenAmounts } from './rules'

type ImportMeta = { id: string; stats: ImportStats; rules_snapshot: Record<string, unknown> }
type StoredCharge = {
  id: string
  import_id: string
  installments: Installment[]
  total_open_cents: number
  open_count: number
  guardian_phone: string | null
  guardian_email: string | null
  warnings: ChargeWarning[]
}

async function allCharges(db: SupabaseClient, importIds?: string[]): Promise<StoredCharge[]> {
  const PAGE = 1000
  const rows: StoredCharge[] = []
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from('charges')
      .select('id, import_id, installments, total_open_cents, open_count, guardian_phone, guardian_email, warnings')
      .order('id')
      .range(from, from + PAGE - 1)
    if (importIds) q = q.in('import_id', importIds)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as StoredCharge[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

/** Atualiza os números do resumo de cada importação a partir das cobranças que restaram. */
async function writeImportStats(db: SupabaseClient, imports: ImportMeta[], charges: StoredCharge[], basis?: AmountBasis) {
  for (const imp of imports) {
    const mine = charges.filter((c) => c.import_id === imp.id)
    const stats: ImportStats = {
      ...imp.stats,
      cobrancas: mine.length,
      parcelasCobradas: mine.reduce((s, c) => s + (c.open_count ?? 0), 0),
      totalCents: mine.reduce((s, c) => s + Number(c.total_open_cents ?? 0), 0),
      comAlertaCritico: mine.filter((c) => hasCritical(c.warnings)).length,
      semWhatsapp: mine.filter((c) => !c.guardian_phone).length,
      semEmail: mine.filter((c) => !c.guardian_email).length,
    }
    const snapshot = basis ? { ...imp.rules_snapshot, amount_basis: basis } : imp.rules_snapshot
    const same = JSON.stringify(stats) === JSON.stringify(imp.stats) && JSON.stringify(snapshot) === JSON.stringify(imp.rules_snapshot)
    if (same) continue
    const { error } = await db.from('imports').update({ stats, rules_snapshot: snapshot }).eq('id', imp.id)
    if (error) throw new Error(error.message)
  }
}

/**
 * Recalcula o valor em aberto das cobranças já importadas com a base de valor atual
 * (valor cheio × valor com desconto) e atualiza o total de cada importação. Cada
 * importação mantém a regra de "parcela em aberto" com que foi lida.
 * Mensagens já enviadas não mudam: o histórico guarda o texto exato que foi enviado.
 */
export async function recalcStoredCharges(db: SupabaseClient, basis: AmountBasis, fallbackRule: OpenRule): Promise<number> {
  const { data, error } = await db.from('imports').select('id, stats, rules_snapshot')
  if (error) throw new Error(error.message)
  const imports = (data ?? []) as ImportMeta[]
  const ruleOf = new Map(imports.map((i) => [i.id, (i.rules_snapshot?.open_rule as OpenRule | undefined) ?? fallbackRule]))

  const charges = await allCharges(db)
  const changed: StoredCharge[] = []
  for (const c of charges) {
    const next = recomputeOpenAmounts(c.installments ?? [], { open_rule: ruleOf.get(c.import_id) ?? fallbackRule, amount_basis: basis })
    const differs = next.total_open_cents !== Number(c.total_open_cents) || next.installments.some((i, k) => i.emAbertoCents !== c.installments[k]?.emAbertoCents)
    if (!differs) continue
    c.installments = next.installments
    c.total_open_cents = next.total_open_cents
    changed.push(c)
  }

  for (let i = 0; i < changed.length; i += 20) {
    const results = await Promise.all(
      changed.slice(i, i + 20).map((c) => db.from('charges').update({ installments: c.installments, total_open_cents: c.total_open_cents }).eq('id', c.id)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) throw new Error(failed.error.message)
  }

  await writeImportStats(db, imports, charges, basis)
  return changed.length
}

/** Depois de apagar cobranças, mantém o resumo das importações coerente. */
export async function refreshImportStats(db: SupabaseClient, importIds: string[]) {
  if (importIds.length === 0) return
  const { data, error } = await db.from('imports').select('id, stats, rules_snapshot').in('id', importIds)
  if (error) throw new Error(error.message)
  await writeImportStats(db, (data ?? []) as ImportMeta[], await allCharges(db, importIds))
}
