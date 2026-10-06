import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { Badge, Card, EmptyState, PageHeader, type Tone } from '@/components/ui'
import { requireAdmin } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { createUserClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Logs de acesso' }

const PAGE = 100

const LABELS: Record<string, [string, Tone]> = {
  login: ['Entrou', 'ok'],
  login_falhou: ['Falha de login', 'bad'],
  logout: ['Saiu', 'neutral'],
  importacao_criada: ['Importou relatório', 'accent'],
  importacao_excluida: ['Excluiu importação', 'warn'],
  importacao_visualizada: ['Abriu conferência', 'neutral'],
  pdf_baixado: ['Baixou PDF', 'warn'],
  pdf_excluido: ['Excluiu PDF', 'warn'],
  cobranca_editada: ['Editou cobrança', 'neutral'],
  cobranca_conferida: ['Conferiu alerta', 'neutral'],
  cobranca_cancelada: ['Cancelou cobrança', 'warn'],
  cobranca_reaberta: ['Reabriu cobrança', 'neutral'],
  cobranca_excluida: ['Apagou cobranças', 'bad'],
  envio_realizado: ['Enviou cobranças', 'brand'],
  envio_teste: ['Envio de teste', 'neutral'],
  envio_excluido: ['Apagou envios do histórico', 'bad'],
  valores_recalculados: ['Recalculou valores', 'warn'],
  configuracoes_alteradas: ['Alterou configurações', 'warn'],
  integracao_alterada: ['Alterou credenciais', 'bad'],
  usuario_criado: ['Criou usuário', 'warn'],
  usuario_alterado: ['Alterou usuário', 'warn'],
}

type Log = { id: number; user_email: string | null; action: string; entity: string | null; entity_id: string | null; details: Record<string, unknown>; ip: string | null; created_at: string }

function summarize(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ acao?: string; pagina?: string }> }) {
  await requireAdmin()
  const { acao, pagina } = await searchParams
  const page = Math.max(1, parseInt(pagina ?? '1', 10) || 1)
  const db = await createUserClient()
  let q = db.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
  if (acao && LABELS[acao]) q = q.eq('action', acao)
  const { data, count } = await q
  const logs = (data ?? []) as Log[]
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE))

  return (
    <>
      <PageHeader title="Logs de acesso" description="Registro de entradas no sistema, importações, envios e alterações de configuração — quem fez, quando e de onde." />
      <form className="mb-4 flex flex-wrap gap-2" action="/logs">
        <select name="acao" defaultValue={acao ?? ''} className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm" aria-label="Ação">
          <option value="">Todas as ações</option>
          {Object.entries(LABELS).map(([k, [l]]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      <Card>
        {logs.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-6" />} title="Nenhum registro" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-xs text-ink-3">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Quando</th>
                  <th className="px-3 py-2.5 font-medium">Usuário</th>
                  <th className="px-3 py-2.5 font-medium">Ação</th>
                  <th className="px-3 py-2.5 font-medium">Detalhes</th>
                  <th className="px-3 py-2.5 pr-5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((l) => {
                  const t = formatDateTime(l.created_at)
                  const [label, tone] = LABELS[l.action] ?? [l.action, 'neutral' as Tone]
                  return (
                    <tr key={l.id} className="align-top">
                      <td className="py-2.5 pr-3 pl-5 whitespace-nowrap tabular">
                        {t.date} <span className="text-ink-3">{t.time}</span>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5">{l.user_email ?? '—'}</td>
                      <td className="px-3 py-2.5"><Badge tone={tone}>{label}</Badge></td>
                      <td className="max-w-[420px] px-3 py-2.5 text-xs break-words text-ink-2">{summarize(l.details ?? {})}</td>
                      <td className="px-3 py-2.5 pr-5 font-mono text-xs text-ink-3">{l.ip ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-3">Página {page} de {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="rounded-lg border border-line-strong bg-surface px-3 py-1.5" href={`/logs?${new URLSearchParams({ ...(acao ? { acao } : {}), pagina: String(page - 1) })}`}>Anterior</Link>}
            {page < pages && <Link className="rounded-lg border border-line-strong bg-surface px-3 py-1.5" href={`/logs?${new URLSearchParams({ ...(acao ? { acao } : {}), pagina: String(page + 1) })}`}>Próxima</Link>}
          </div>
        </nav>
      )}
    </>
  )
}
