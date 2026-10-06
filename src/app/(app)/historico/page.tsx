import type { Metadata } from 'next'
import { History } from 'lucide-react'
import Link from 'next/link'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { createUserClient } from '@/lib/supabase/server'
import type { DispatchRow } from '@/lib/types'
import { HistoryTable } from './history-table'

export const metadata: Metadata = { title: 'Histórico' }

const PAGE = 50

type SP = { q?: string; canal?: string; status?: string; de?: string; ate?: string; pagina?: string }

const STATUS_OPTIONS = [
  ['', 'Todos os status'],
  ['enviado', 'Enviado'],
  ['entregue', 'Entregue'],
  ['erro', 'Erro'],
  ['pendente', 'Pendente'],
  ['cancelado', 'Cancelado'],
  ['simulado', 'Teste'],
]

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser()
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.pagina ?? '1', 10) || 1)
  const db = await createUserClient()

  let query = db
    .from('dispatches')
    .select('*, messages(id, channel, recipient, intended_recipient, subject, body, status, error_message, sent_at, delivered_at, read_at)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1)

  const q = (sp.q ?? '').replace(/[,()%*\\]/g, ' ').trim()
  if (q) query = query.or(`guardian_name.ilike.%${q}%,student_name.ilike.%${q}%`)
  if (sp.canal === 'whatsapp' || sp.canal === 'email') query = query.contains('channels', [sp.canal])
  if (sp.status && STATUS_OPTIONS.some(([v]) => v === sp.status)) query = query.eq('status', sp.status)
  if (sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de)) query = query.gte('created_at', new Date(`${sp.de}T00:00:00-03:00`).toISOString())
  if (sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate)) query = query.lte('created_at', new Date(`${sp.ate}T23:59:59.999-03:00`).toISOString())

  const { data, count } = await query
  const rows = (data ?? []) as DispatchRow[]
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE))
  const link = (p: number) => {
    const params = new URLSearchParams(Object.entries({ ...sp, pagina: String(p) }).filter(([, v]) => v) as [string, string][])
    return `/historico?${params.toString()}`
  }

  const field = 'h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-brand-strong focus:ring-2 focus:ring-brand/20 focus:outline-none'

  return (
    <>
      <PageHeader title="Histórico" description="Todas as cobranças enviadas, com canal, status de entrega e funcionário responsável. Cancelamentos também ficam registrados. Administradores podem apagar registros feitos por engano." />

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_170px_150px_150px_auto]" action="/historico">
        <input name="q" defaultValue={sp.q} placeholder="Responsável ou aluno" className={field} aria-label="Buscar" />
        <select name="canal" defaultValue={sp.canal ?? ''} className={field} aria-label="Canal">
          <option value="">Todos os canais</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ''} className={field} aria-label="Status">
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input type="date" name="de" defaultValue={sp.de} className={field} aria-label="Data inicial" />
        <input type="date" name="ate" defaultValue={sp.ate} className={field} aria-label="Data final" />
        <div className="flex gap-2">
          <button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-black">Filtrar</button>
          <Link href="/historico" className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-ink-2 hover:bg-black/5">Limpar</Link>
        </div>
      </form>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title="Nenhum registro encontrado">
            Os envios aparecem aqui assim que forem confirmados na conferência.
          </EmptyState>
        ) : (
          <HistoryTable rows={rows} canDelete={user.role === 'admin'} />
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginação">
          <span className="text-ink-3">
            Página {page} de {pages} · {count} registros
          </span>
          <div className="flex gap-2">
            {page > 1 && <Link href={link(page - 1)} className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 hover:bg-subtle">Anterior</Link>}
            {page < pages && <Link href={link(page + 1)} className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 hover:bg-subtle">Próxima</Link>}
          </div>
        </nav>
      )}
    </>
  )
}
