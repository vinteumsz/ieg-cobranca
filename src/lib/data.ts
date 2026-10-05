import 'server-only'
import { normalizeSettings, type Settings } from './settings'
import { createAdminClient } from './supabase/server'

export async function loadSettings(): Promise<Settings> {
  const { data, error } = await createAdminClient().from('settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error('Falha ao carregar configurações: ' + error.message)
  return normalizeSettings(data as Partial<Settings> | null)
}

/** Última cobrança enviada (não simulada, sem erro) para o mesmo responsável + aluno. */
export async function recentDispatches(groupKeys: string[], windowDays: number) {
  if (groupKeys.length === 0) return new Map<string, string>()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const out = new Map<string, string>()
  for (let i = 0; i < groupKeys.length; i += 200) {
    const { data, error } = await createAdminClient()
      .from('dispatches')
      .select('group_key, created_at')
      .in('group_key', groupKeys.slice(i, i + 200))
      .in('status', ['pendente', 'enviado', 'entregue'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    for (const r of data ?? []) if (!out.has(r.group_key)) out.set(r.group_key, r.created_at)
  }
  return out
}
