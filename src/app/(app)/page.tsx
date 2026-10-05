import type { Metadata } from 'next'
import { displayUser, requireUser } from '@/lib/auth'
import { loadSettings } from '@/lib/data'
import { startOfTodayUTC, todayISO } from '@/lib/format'
import { createUserClient } from '@/lib/supabase/server'
import type { ChargeRow, ImportRow } from '@/lib/types'
import { buildDashboard, DashboardView } from './dashboard-view'

export const metadata: Metadata = { title: 'Painel' }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const user = await requireUser()
  const { aviso } = await searchParams
  const db = await createUserClient()
  const settings = await loadSettings()
  const today = todayISO()
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const sentStatuses = ['enviado', 'entregue', 'lido']

  const [{ data: lastImport }, sentToday, wa30, email30] = await Promise.all([
    db.from('imports').select('id, file_name, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('messages').select('id', { count: 'exact', head: true }).in('status', sentStatuses).gte('sent_at', startOfTodayUTC()),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').in('status', sentStatuses).gte('sent_at', since30),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').in('status', sentStatuses).gte('sent_at', since30),
  ])

  const imp = lastImport as Pick<ImportRow, 'id' | 'file_name' | 'created_at'> | null
  let charges: ChargeRow[] = []
  if (imp) {
    const { data } = await db
      .from('charges')
      .select('id, group_key, guardian_cpf, guardian_name, student_name, class_name, installments, open_count, total_open_cents, status')
      .eq('import_id', imp.id)
      .neq('status', 'cancelado')
    charges = (data ?? []) as ChargeRow[]
  }

  return (
    <DashboardView
      firstName={displayUser(user).split(' ')[0]}
      imp={imp}
      aviso={aviso}
      data={buildDashboard(charges, settings, today)}
      sentToday={sentToday.count ?? 0}
      wa30={wa30.count ?? 0}
      email30={email30.count ?? 0}
    />
  )
}
