import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { toComposeSettings } from '@/lib/billing/compose'
import { isInterestConfigured } from '@/lib/billing/interest'
import { loadSettings, recentDispatches } from '@/lib/data'
import { todayISO } from '@/lib/format'
import { effective } from '@/lib/settings'
import { createUserClient } from '@/lib/supabase/server'
import type { ChargeRow, ImportRow } from '@/lib/types'
import { ConferenceView } from './conference-view'

export const metadata: Metadata = { title: 'Conferência' }

export default async function ConferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const user = await requireUser()
  const db = await createUserClient()

  const [{ data: imp }, { data: charges }, settings] = await Promise.all([
    db.from('imports').select('*').eq('id', id).maybeSingle(),
    db.from('charges').select('*').eq('import_id', id).order('guardian_name'),
    loadSettings(),
  ])
  if (!imp) notFound()

  const rows = (charges ?? []) as ChargeRow[]
  const recent = await recentDispatches([...new Set(rows.map((c) => c.group_key))], settings.duplicate_window_days)
  const today = todayISO()

  await audit(user, 'importacao_visualizada', { entity: 'import', entityId: id })

  return (
    <ConferenceView
      importRow={imp as ImportRow}
      initialCharges={rows}
      recent={Object.fromEntries(recent)}
      compose={toComposeSettings(effective(settings), today)}
      interestConfigured={isInterestConfigured(settings)}
      testMode={settings.test_mode}
      isAdmin={user.role === 'admin'}
      windowDays={settings.duplicate_window_days}
    />
  )
}
