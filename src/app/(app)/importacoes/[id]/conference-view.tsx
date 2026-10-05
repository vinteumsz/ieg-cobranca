'use client'

import { AlertTriangle, Clock, Download, FileText, Mail, MessageCircle, Search, Send, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, Badge, Button, Card, cx, EmptyState, Input, Modal, Notice } from '@/components/ui'
import { useToast } from '@/components/toast'
import type { ComposeSettings } from '@/lib/billing/compose'
import { hasCritical } from '@/lib/billing/rules'
import { formatCents, formatCpf, formatDateTime, formatPhone, monthShortLabel, nameKey, onlyDigits } from '@/lib/format'
import type { ChargeRow, ImportRow } from '@/lib/types'
import { ChannelBadge, StatusBadge } from './badges'
import { ChargeDrawer } from './charge-drawer'
import { SendDialog, type Channel } from './send-dialog'

type Filter = 'todos' | 'pendentes' | 'selecionados' | 'enviados' | 'erro' | 'alerta' | 'cancelados'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'selecionados', label: 'Selecionados' },
  { key: 'enviados', label: 'Mensagem enviada' },
  { key: 'erro', label: 'Erro no envio' },
  { key: 'alerta', label: 'Com alerta' },
  { key: 'cancelados', label: 'Cancelados' },
]

type Props = {
  importRow: ImportRow
  initialCharges: ChargeRow[]
  recent: Record<string, string>
  compose: ComposeSettings
  interestConfigured: boolean
  testMode: boolean
  isAdmin: boolean
  windowDays: number
}

const needsReview = (c: ChargeRow) => hasCritical(c.warnings) && !c.reviewed
const hasError = (c: ChargeRow) => c.status === 'erro' || c.wa_status === 'erro' || c.email_status === 'erro'

const monthIdx = (m: string) => parseInt(m.slice(0, 4), 10) * 12 + parseInt(m.slice(5, 7), 10)

/** "Jan a Set/26", "Ago, Set/26" ou "Abr/26, Jun/26 +2" */
function monthsSummary(c: ChargeRow) {
  const ms = [...new Set(c.installments.filter((i) => i.cobrar).map((i) => i.vencimento.slice(0, 7)))].sort()
  if (ms.length === 0) return '—'
  if (ms.length === 1) return monthShortLabel(ms[0])
  const first = monthShortLabel(ms[0])
  const last = monthShortLabel(ms[ms.length - 1])
  const sameYear = ms[0].slice(0, 4) === ms[ms.length - 1].slice(0, 4)
  const consecutive = ms.every((m, i) => i === 0 || monthIdx(m) === monthIdx(ms[i - 1]) + 1)
  if (consecutive) return ms.length === 2 && sameYear ? `${first.split('/')[0]}, ${last}` : `${sameYear ? first.split('/')[0] : first} a ${last}`
  return ms.length === 2 ? `${first}, ${last}` : `${first}, ${monthShortLabel(ms[1])} +${ms.length - 2}`
}

export function ConferenceView({ importRow, initialCharges, recent, compose, interestConfigured, testMode, isAdmin, windowDays }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [charges, setCharges] = useState(initialCharges)
  useEffect(() => setCharges(initialCharges), [initialCharges])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [sending, setSending] = useState<{ ids: string[]; channels: Channel[] } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const matches = useMemo(() => {
    const q = nameKey(query)
    const digits = onlyDigits(query)
    return (c: ChargeRow) => {
      if (!query.trim()) return true
      if (digits.length >= 3 && (c.guardian_cpf ?? '').includes(digits)) return true
      if (!q) return false
      return [c.guardian_name, c.student_name, c.class_name ?? ''].some((v) => nameKey(v).includes(q))
    }
  }, [query])

  const byFilter: Record<Filter, (c: ChargeRow) => boolean> = useMemo(
    () => ({
      todos: () => true,
      pendentes: (c) => c.status === 'pendente',
      selecionados: (c) => selected.has(c.id),
      enviados: (c) => c.status === 'enviado' || c.status === 'entregue',
      erro: hasError,
      alerta: needsReview,
      cancelados: (c) => c.status === 'cancelado',
    }),
    [selected],
  )

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, charges.filter((c) => byFilter[f.key](c)).length])) as Record<Filter, number>, [charges, byFilter])
  const visible = useMemo(() => charges.filter((c) => byFilter[filter](c) && matches(c)), [charges, filter, matches, byFilter])
  const selectable = visible.filter((c) => c.status !== 'cancelado')
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id))
  const selectedCharges = charges.filter((c) => selected.has(c.id))
  const totalSelected = selectedCharges.reduce((s, c) => s + c.total_open_cents, 0)
  const totalOpen = charges.filter((c) => c.status !== 'cancelado').reduce((s, c) => s + c.total_open_cents, 0)
  const open = charges.find((c) => c.id === openId) ?? null

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s)
      if (allVisibleSelected) selectable.forEach((c) => n.delete(c.id))
      else selectable.forEach((c) => n.add(c.id))
      return n
    })
  }

  async function deleteImport() {
    setDeleting(true)
    try {
      await apiFetch(`/api/imports/${importRow.id}`, { method: 'DELETE' })
      toast('Importação excluída.')
      router.push('/importacoes')
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
      setDeleting(false)
    }
  }

  const imported = formatDateTime(importRow.created_at)

  return (
    <div className={cx(selected.size > 0 && 'pb-28')}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/importacoes" className="text-sm text-ink-3 hover:text-ink">← Importações</Link>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Conferência</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <FileText className="size-4 text-ink-3" />
            <span className="max-w-[40ch] truncate font-medium text-ink">{importRow.file_name}</span>
            <span className="text-ink-3">· importado em {imported.date} às {imported.time}{importRow.imported_by_name ? ` por ${importRow.imported_by_name}` : ''}</span>
            {importRow.extraction_method === 'ocr' && <Badge tone="brand">lido por OCR</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && importRow.storage_path && (
            <a href={`/api/imports/${importRow.id}/arquivo`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-subtle">
              <Download className="size-4" /> PDF original
            </a>
          )}
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
            Excluir importação
          </Button>
        </div>
      </div>

      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Cobranças', String(charges.length)],
          ['Total em aberto', formatCents(totalOpen)],
          ['Com alerta para revisar', String(counts.alerta)],
          ['Já enviadas', String(counts.enviados)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface px-4 py-3">
            <dt className="text-xs text-ink-3">{k}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold whitespace-nowrap sm:text-xl">{v}</dd>
          </div>
        ))}
      </dl>

      {importRow.parse_warnings?.length > 0 && (
        <div className="mb-4 space-y-2">
          {importRow.parse_warnings.map((w) => (
            <Notice key={w} tone="warn">{w}</Notice>
          ))}
        </div>
      )}
      {!interestConfigured && (
        <p className="mb-4 text-sm text-ink-3">
          Taxas de juros e multa não informadas: as mensagens avisam que “os valores estão sujeitos à atualização”, sem calcular encargos.
        </p>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar responsável, aluno, CPF ou turma" className="pl-9" aria-label="Buscar" />
            {query && (
              <button onClick={() => setQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label="Limpar busca">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible md:pb-0" role="tablist" aria-label="Filtros">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cx(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                  filter === f.key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-black/5',
                )}
              >
                {f.label}
                <span className={cx('tabular text-xs', filter === f.key ? 'text-white/70' : 'text-ink-3')}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title={charges.length === 0 ? 'Nenhuma cobrança nesta importação' : 'Nada encontrado'}>
            {charges.length === 0 ? 'Todos os alunos do relatório estão em dia com as parcelas vencidas.' : 'Ajuste a busca ou o filtro.'}
          </EmptyState>
        ) : (
          <>
            {/* Tabela (telas largas) */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[960px] table-fixed text-sm">
                <colgroup>
                  <col className="w-11" />
                  <col className="w-[18%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-11" />
                  <col className="w-[104px]" />
                  <col className="w-[136px]" />
                  <col className="w-[15%]" />
                  <col className="w-[100px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-subtle text-left text-xs text-ink-3">
                    <th className="py-2.5 pl-4">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="size-4" aria-label="Selecionar todos os visíveis" />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Responsável · CPF</th>
                    <th className="px-3 py-2.5 font-medium">Aluno · Turma</th>
                    <th className="px-3 py-2.5 font-medium">Mensalidades em aberto</th>
                    <th className="px-2 py-2.5 text-right font-medium" title="Quantidade de parcelas">Qtd.</th>
                    <th className="px-3 py-2.5 text-right font-medium">Valor total</th>
                    <th className="px-3 py-2.5 font-medium">Telefone · WhatsApp</th>
                    <th className="px-3 py-2.5 font-medium">E-mail · envio</th>
                    <th className="px-3 py-2.5 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setOpenId(c.id)}
                      className={cx('cursor-pointer align-top transition-colors hover:bg-brand-soft/40', selected.has(c.id) && 'bg-brand-soft/60', c.status === 'cancelado' && 'opacity-60')}
                    >
                      <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          disabled={c.status === 'cancelado'}
                          className="mt-0.5 size-4"
                          aria-label={`Selecionar ${c.guardian_name}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {needsReview(c) && <AlertTriangle className="size-4 shrink-0 text-bad" aria-label="Alerta para revisar" />}
                          <span className="truncate font-medium">{c.guardian_name || 'Não identificado'}</span>
                        </div>
                        <p className="truncate text-xs text-ink-3 tabular">{c.guardian_cpf ? formatCpf(c.guardian_cpf) : 'CPF não encontrado'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate">{c.student_name}</p>
                        <p className="truncate text-xs text-ink-3">{c.class_name || '—'}</p>
                      </td>
                      <td className="truncate px-3 py-3 text-ink-2" title={c.installments.filter((i) => i.cobrar).map((i) => i.mes).join(', ')}>
                        {monthsSummary(c)}
                      </td>
                      <td className="px-2 py-3 text-right tabular">{c.open_count}</td>
                      <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular">{formatCents(c.total_open_cents)}</td>
                      <td className="px-3 py-3">
                        <p className="truncate text-[13px] text-ink-2">{c.guardian_phone ? formatPhone(c.guardian_phone) : '—'}</p>
                        <div className="mt-1"><ChannelBadge status={c.wa_status} available={!!c.guardian_phone} missingLabel="sem celular" /></div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate text-ink-2" title={c.guardian_email ?? undefined}>{c.guardian_email || '—'}</p>
                        <div className="mt-1"><ChannelBadge status={c.email_status} available={!!c.guardian_email} missingLabel="sem e-mail" /></div>
                      </td>
                      <td className="px-3 py-3 pr-4">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={c.status} />
                          {recent[c.group_key] && (
                            <span className="flex items-center gap-1 text-[11px] text-ink-3" title="Última cobrança enviada">
                              <Clock className="size-3" /> {formatDateTime(recent[c.group_key]).date}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartões (celular e telas menores) */}
            <div className="xl:hidden">
              <label className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm text-ink-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="size-4" /> Selecionar todos os visíveis
              </label>
              <ul className="divide-y divide-line">
                {visible.map((c) => (
                  <li key={c.id} className={cx('flex gap-3 px-4 py-3.5', selected.has(c.id) && 'bg-brand-soft/60', c.status === 'cancelado' && 'opacity-60')}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={c.status === 'cancelado'}
                      className="mt-1 size-5 shrink-0"
                      aria-label={`Selecionar ${c.guardian_name}`}
                    />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(c.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-1.5 font-medium">
                          {needsReview(c) && <AlertTriangle className="size-4 shrink-0 text-bad" />}
                          <span className="truncate">{c.guardian_name || 'Não identificado'}</span>
                        </p>
                        <span className="font-semibold whitespace-nowrap tabular">{formatCents(c.total_open_cents)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-2">
                        {c.student_name}
                        {c.class_name ? ` · ${c.class_name}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {c.open_count} parcela(s): {monthsSummary(c)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={c.status} />
                        {!c.guardian_phone && <Badge tone="warn">sem celular</Badge>}
                        {!c.guardian_email && <Badge tone="warn">sem e-mail</Badge>}
                        {recent[c.group_key] && <Badge icon={<Clock className="size-3" />}>{formatDateTime(recent[c.group_key]).date}</Badge>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Card>

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 sm:px-4">
            <div className="text-sm">
              <strong>{selected.size}</strong> selecionado{selected.size === 1 ? '' : 's'} · {formatCents(totalSelected)}
              <button className="ml-3 text-ink-3 underline underline-offset-2 hover:text-ink" onClick={() => setSelected(new Set())}>
                Limpar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<MessageCircle className="size-4" />} onClick={() => setSending({ ids: [...selected], channels: ['whatsapp'] })}>
                Enviar WhatsApp selecionados
              </Button>
              <Button variant="secondary" icon={<Mail className="size-4" />} onClick={() => setSending({ ids: [...selected], channels: ['email'] })}>
                Enviar e-mail selecionados
              </Button>
              <Button variant="brand" icon={<Send className="size-4" />} onClick={() => setSending({ ids: [...selected], channels: ['whatsapp', 'email'] })}>
                Enviar WhatsApp + e-mail
              </Button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <ChargeDrawer
          key={open.id}
          charge={open}
          compose={compose}
          recentAt={recent[open.group_key] ?? null}
          onClose={() => setOpenId(null)}
          onUpdated={(u) => setCharges((cs) => cs.map((c) => (c.id === u.id ? u : c)))}
          onSend={(channels) => setSending({ ids: [open.id], channels })}
        />
      )}

      {sending && (
        <SendDialog
          ids={sending.ids}
          channels={sending.channels}
          onClose={() => setSending(null)}
          onFinished={() => {
            setSending(null)
            if (sending.ids.length > 1) setSelected(new Set())
            router.refresh()
          }}
        />
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir importação?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Voltar</Button>
            <Button variant="danger" loading={deleting} onClick={deleteImport}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          As {charges.length} cobranças desta conferência{importRow.storage_path ? ' e o PDF arquivado' : ''} serão apagadas. O histórico de mensagens já enviadas é mantido para auditoria.
        </p>
      </Modal>
    </div>
  )
}
