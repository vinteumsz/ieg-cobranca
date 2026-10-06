'use client'

import { AlertTriangle, ArrowDown, ArrowUp, Clock, Download, FileText, Mail, MessageCircle, Search, Send, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, Badge, Button, Card, cx, EmptyState, Input, Modal, Notice, Select } from '@/components/ui'
import { useToast } from '@/components/toast'
import type { ComposeSettings } from '@/lib/billing/compose'
import { computeDebtUpdate } from '@/lib/billing/interest'
import { hasCritical } from '@/lib/billing/rules'
import { formatCents, formatCpf, formatDateTime, formatPhone, monthShortLabel, nameKey, onlyDigits, reaisToCents } from '@/lib/format'
import type { ChargeRow, ImportRow } from '@/lib/types'
import { ChannelBadge, StatusBadge } from './badges'
import { ChargeDrawer } from './charge-drawer'
import { ManualQueue } from './manual'
import { SendDialog, type Channel } from './send-dialog'

type Filter = 'todos' | 'pendentes' | 'selecionados' | 'enviados' | 'erro' | 'alerta' | 'cancelados'
type SortKey = 'nome' | 'valor_desc' | 'valor_asc' | 'qtd_desc' | 'qtd_asc' | 'atraso' | 'turma'
type QtyFilter = 'todas' | '1' | '2' | '3' | '6'
type ContactFilter = 'todos' | 'com_whatsapp' | 'sem_celular' | 'com_email' | 'sem_email' | 'sem_contato'

const SORTS: [SortKey, string][] = [
  ['nome', 'Nome (A–Z)'],
  ['valor_desc', 'Maior valor'],
  ['valor_asc', 'Menor valor'],
  ['qtd_desc', 'Mais parcelas'],
  ['qtd_asc', 'Menos parcelas'],
  ['atraso', 'Atraso mais antigo'],
  ['turma', 'Turma'],
]
const QTYS: [QtyFilter, string][] = [
  ['todas', 'Todas'],
  ['1', 'Só 1 parcela'],
  ['2', '2 ou mais'],
  ['3', '3 ou mais'],
  ['6', '6 ou mais'],
]
const CONTACTS: [ContactFilter, string][] = [
  ['todos', 'Todos'],
  ['com_whatsapp', 'Com celular'],
  ['sem_celular', 'Sem celular'],
  ['com_email', 'Com e-mail'],
  ['sem_email', 'Sem e-mail'],
  ['sem_contato', 'Sem celular e sem e-mail'],
]
const byName = (a: ChargeRow, b: ChargeRow) =>
  a.guardian_name.localeCompare(b.guardian_name, 'pt-BR') || a.student_name.localeCompare(b.student_name, 'pt-BR')
const COMPARE: Record<SortKey, (a: ChargeRow, b: ChargeRow) => number> = {
  nome: byName,
  valor_desc: (a, b) => b.total_open_cents - a.total_open_cents || byName(a, b),
  valor_asc: (a, b) => a.total_open_cents - b.total_open_cents || byName(a, b),
  qtd_desc: (a, b) => b.open_count - a.open_count || b.total_open_cents - a.total_open_cents || byName(a, b),
  qtd_asc: (a, b) => a.open_count - b.open_count || a.total_open_cents - b.total_open_cents || byName(a, b),
  atraso: (a, b) => (a.oldest_due ?? '9999').localeCompare(b.oldest_due ?? '9999') || b.total_open_cents - a.total_open_cents || byName(a, b),
  turma: (a, b) => (a.class_name ?? '~').localeCompare(b.class_name ?? '~', 'pt-BR', { numeric: true }) || byName(a, b),
}

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
  sendMode: 'manual' | 'automatico'
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

export function ConferenceView({ importRow, initialCharges, recent: initialRecent, compose, interestConfigured, isAdmin, sendMode }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [charges, setCharges] = useState(initialCharges)
  useEffect(() => setCharges(initialCharges), [initialCharges])
  const [recent, setRecent] = useState(initialRecent)
  useEffect(() => setRecent(initialRecent), [initialRecent])
  const onRegistered = (u: ChargeRow, sentAt: string) => {
    if (!u) return
    setCharges((cs) => cs.map((c) => (c.id === u.id ? u : c)))
    setRecent((r) => ({ ...r, [u.group_key]: sentAt }))
  }
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('nome')
  const [qty, setQty] = useState<QtyFilter>('todas')
  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')
  const [turma, setTurma] = useState('')
  const [contact, setContact] = useState<ContactFilter>('todos')
  const turmas = useMemo(
    () => [...new Set(charges.map((c) => c.class_name).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [charges],
  )
  const minCents = reaisToCents(minValue)
  const maxCents = reaisToCents(maxValue)
  const extraActive = qty !== 'todas' || minCents !== null || maxCents !== null || !!turma || contact !== 'todos'
  const clearExtra = () => {
    setQty('todas')
    setMinValue('')
    setMaxValue('')
    setTurma('')
    setContact('todos')
  }
  const [filter, setFilter] = useState<Filter>('todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [sending, setSending] = useState<{ ids: string[]; channels: Channel[] } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [deleteHistory, setDeleteHistory] = useState(false)
  const [deletingCharges, setDeletingCharges] = useState(false)

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
  const visible = useMemo(() => {
    const passes = (c: ChargeRow) => {
      if (qty !== 'todas' && (qty === '1' ? c.open_count !== 1 : c.open_count < Number(qty))) return false
      if (minCents !== null && c.total_open_cents < minCents) return false
      if (maxCents !== null && c.total_open_cents > maxCents) return false
      if (turma && c.class_name !== turma) return false
      switch (contact) {
        case 'com_whatsapp': return !!c.guardian_phone
        case 'sem_celular': return !c.guardian_phone
        case 'com_email': return !!c.guardian_email
        case 'sem_email': return !c.guardian_email
        case 'sem_contato': return !c.guardian_phone && !c.guardian_email
        default: return true
      }
    }
    return charges.filter((c) => byFilter[filter](c) && matches(c) && passes(c)).sort(COMPARE[sort])
  }, [charges, filter, matches, byFilter, qty, minCents, maxCents, turma, contact, sort])
  const visibleTotal = visible.filter((c) => c.status !== 'cancelado').reduce((sum, c) => sum + c.total_open_cents, 0)
  const toggleSort = (desc: SortKey, asc: SortKey) => setSort((s) => (s === desc ? asc : desc))
  const selectable = visible
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id))
  const selectedCharges = charges.filter((c) => selected.has(c.id))
  const totalSelected = selectedCharges.reduce((s, c) => s + c.total_open_cents, 0)
  // Canceladas podem ser selecionadas para apagar, mas não entram no envio
  const sendableIds = selectedCharges.filter((c) => c.status !== 'cancelado').map((c) => c.id)
  const totalOpen = charges.filter((c) => c.status !== 'cancelado').reduce((s, c) => s + c.total_open_cents, 0)
  // Valor com multa e juros até hoje (mesmo cálculo das mensagens)
  const updated = useMemo(
    () => new Map(interestConfigured ? charges.map((c) => [c.id, computeDebtUpdate(c.installments, compose, compose.today).updatedCents]) : []),
    [charges, compose, interestConfigured],
  )
  const totalUpdated = charges.filter((c) => c.status !== 'cancelado').reduce((s, c) => s + (updated.get(c.id) ?? c.total_open_cents), 0)
  const pctLabel = (n: number | null) => `${String(n ?? 0).replace('.', ',')}%`
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

  async function deleteCharges() {
    if (!deleteIds) return
    setDeletingCharges(true)
    try {
      const r = await apiFetch<{ deleted: string[]; envios: number }>('/api/charges', { method: 'DELETE', json: { ids: deleteIds, envios: deleteHistory } })
      const gone = new Set(r.deleted)
      setCharges((cs) => cs.filter((c) => !gone.has(c.id)))
      setSelected((sel) => new Set([...sel].filter((id) => !gone.has(id))))
      if (openId && gone.has(openId)) setOpenId(null)
      toast(r.deleted.length === 1 ? 'Cobrança apagada.' : `${r.deleted.length} cobranças apagadas.`)
      setDeleteIds(null)
      setDeleteHistory(false)
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setDeletingCharges(false)
    }
  }

  const deleteTargets = deleteIds ? charges.filter((c) => deleteIds.includes(c.id)) : []
  const deleteTargetsSent = deleteTargets.filter((c) => c.last_sent_at || c.status === 'enviado' || c.status === 'entregue').length

  const imported = formatDateTime(importRow.created_at)

  return (
    <div className={cx(selected.size > 0 && 'pb-40 sm:pb-28')}>
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
            {k === 'Total em aberto' && interestConfigured && (
              <dd className="mt-0.5 text-xs whitespace-nowrap text-ink-3">com multa e juros: <span className="font-medium text-ink-2 tabular">{formatCents(totalUpdated)}</span></dd>
            )}
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
      <p className="mb-4 text-sm text-ink-3">
        {interestConfigured
          ? `Valor cheio das parcelas vencidas. Multa de ${pctLabel(compose.fine_pct)} e juros de ${pctLabel(compose.daily_interest_pct)} ao dia, contados a partir do primeiro dia útil depois do vencimento; o valor atualizado até hoje aparece abaixo de cada total, no detalhe e nas mensagens.`
          : 'Valores pelo valor cheio das parcelas, sem juros. As mensagens avisam que “os valores estão sujeitos à atualização”.'}
      </p>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar responsável, aluno, CPF ou turma" className="pl-9" aria-label="Buscar" />
              {query && (
                <button onClick={() => setQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label="Limpar busca">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <p className="text-sm text-ink-2" aria-live="polite">
              {visible.length === charges.length ? `${charges.length} cobranças` : `Mostrando ${visible.length} de ${charges.length}`} ·{' '}
              <strong className="text-ink tabular">{formatCents(visibleTotal)}</strong>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
            <FilterBox label="Ordenar por" className="lg:w-44">
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9" aria-label="Ordenar por">
                {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </FilterBox>
            <FilterBox label="Parcelas em aberto" className="lg:w-44">
              <Select value={qty} onChange={(e) => setQty(e.target.value as QtyFilter)} className="h-9" aria-label="Quantidade de parcelas">
                {QTYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </FilterBox>
            <FilterBox label="Valor de (R$)" className="lg:w-28">
              <Input value={minValue} onChange={(e) => setMinValue(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-9 tabular" aria-label="Valor mínimo" />
            </FilterBox>
            <FilterBox label="até (R$)" className="lg:w-28">
              <Input value={maxValue} onChange={(e) => setMaxValue(e.target.value)} inputMode="decimal" placeholder="sem limite" className="h-9 tabular" aria-label="Valor máximo" />
            </FilterBox>
            {turmas.length > 1 && (
              <FilterBox label="Turma" className="lg:w-40">
                <Select value={turma} onChange={(e) => setTurma(e.target.value)} className="h-9" aria-label="Turma">
                  <option value="">Todas</option>
                  {turmas.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FilterBox>
            )}
            <FilterBox label="Contato" className="lg:w-48">
              <Select value={contact} onChange={(e) => setContact(e.target.value as ContactFilter)} className="h-9" aria-label="Contato">
                {CONTACTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </FilterBox>
            {extraActive && (
              <Button variant="ghost" size="sm" className="h-9 self-end" icon={<X className="size-3.5" />} onClick={clearExtra}>
                Limpar filtros
              </Button>
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
            {charges.length === 0 ? 'Todos os alunos do relatório estão em dia com as parcelas vencidas.' : 'Ajuste a busca ou os filtros.'}
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
                    <th className="px-3 py-2.5 font-medium">
                      <SortButton active={sort === 'nome'} dir="asc" onClick={() => setSort('nome')}>Responsável · CPF</SortButton>
                    </th>
                    <th className="px-3 py-2.5 font-medium">
                      <SortButton active={sort === 'turma'} dir="asc" onClick={() => setSort('turma')}>Aluno · Turma</SortButton>
                    </th>
                    <th className="px-3 py-2.5 font-medium">
                      <SortButton active={sort === 'atraso'} dir="asc" onClick={() => setSort('atraso')}>Mensalidades em aberto</SortButton>
                    </th>
                    <th className="px-2 py-2.5 text-right font-medium">
                      <SortButton align="right" title="Quantidade de parcelas" active={sort === 'qtd_desc' || sort === 'qtd_asc'} dir={sort === 'qtd_asc' ? 'asc' : 'desc'} onClick={() => toggleSort('qtd_desc', 'qtd_asc')}>Qtd.</SortButton>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      <SortButton align="right" active={sort === 'valor_desc' || sort === 'valor_asc'} dir={sort === 'valor_asc' ? 'asc' : 'desc'} onClick={() => toggleSort('valor_desc', 'valor_asc')}>Valor total</SortButton>
                    </th>
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
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular">
                        <span className="font-semibold">{formatCents(c.total_open_cents)}</span>
                        {updated.has(c.id) && updated.get(c.id) !== c.total_open_cents && (
                          <span className="block text-[11px] text-ink-3" title="Com multa e juros até hoje">c/ juros {formatCents(updated.get(c.id)!)}</span>
                        )}
                      </td>
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
                      className="mt-1 size-5 shrink-0"
                      aria-label={`Selecionar ${c.guardian_name}`}
                    />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(c.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-1.5 font-medium">
                          {needsReview(c) && <AlertTriangle className="size-4 shrink-0 text-bad" />}
                          <span className="truncate">{c.guardian_name || 'Não identificado'}</span>
                        </p>
                        <span className="text-right whitespace-nowrap tabular">
                          <span className="font-semibold">{formatCents(c.total_open_cents)}</span>
                          {updated.has(c.id) && updated.get(c.id) !== c.total_open_cents && (
                            <span className="block text-[11px] text-ink-3">c/ juros {formatCents(updated.get(c.id)!)}</span>
                          )}
                        </span>
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
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="danger-ghost" icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds([...selected])}>
                Apagar
              </Button>
              <Button variant="secondary" disabled={sendableIds.length === 0} icon={<MessageCircle className="size-4" />} onClick={() => setSending({ ids: sendableIds, channels: ['whatsapp'] })}>
                <span className="sm:hidden">WhatsApp</span>
                <span className="hidden sm:inline">{sendMode === 'manual' ? 'WhatsApp dos selecionados' : 'Enviar WhatsApp selecionados'}</span>
              </Button>
              <Button variant="secondary" disabled={sendableIds.length === 0} icon={<Mail className="size-4" />} onClick={() => setSending({ ids: sendableIds, channels: ['email'] })}>
                <span className="sm:hidden">E-mail</span>
                <span className="hidden sm:inline">{sendMode === 'manual' ? 'E-mail dos selecionados' : 'Enviar e-mail selecionados'}</span>
              </Button>
              <Button variant="brand" disabled={sendableIds.length === 0} icon={<Send className="size-4" />} onClick={() => setSending({ ids: sendableIds, channels: ['whatsapp', 'email'] })}>
                <span className="sm:hidden">Os dois</span>
                <span className="hidden sm:inline">{sendMode === 'manual' ? 'WhatsApp + e-mail' : 'Enviar WhatsApp + e-mail'}</span>
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
          sendMode={sendMode}
          onUpdated={(u) => setCharges((cs) => cs.map((c) => (c.id === u.id ? u : c)))}
          onRegistered={onRegistered}
          onSend={(channels) => setSending({ ids: [open.id], channels })}
          onDelete={() => setDeleteIds([open.id])}
        />
      )}

      {sending && sendMode === 'manual' && (
        <ManualQueue
          charges={charges.filter((c) => sending.ids.includes(c.id))}
          channels={sending.channels}
          compose={compose}
          recent={recent}
          onRegistered={onRegistered}
          onClose={() => {
            setSending(null)
            setSelected(new Set())
            router.refresh()
          }}
        />
      )}

      {sending && sendMode === 'automatico' && (
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
        open={!!deleteIds}
        onClose={() => {
          if (deletingCharges) return
          setDeleteIds(null)
          setDeleteHistory(false)
        }}
        title={deleteTargets.length === 1 ? 'Apagar esta cobrança?' : `Apagar ${deleteTargets.length} cobranças?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={deletingCharges} onClick={() => { setDeleteIds(null); setDeleteHistory(false) }}>Voltar</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={deletingCharges} onClick={deleteCharges}>Apagar</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {deleteTargets.length === 1 ? (
            <p>
              A cobrança de <strong className="text-ink">{deleteTargets[0].guardian_name || 'responsável não identificado'}</strong> (aluno(a) {deleteTargets[0].student_name}, {formatCents(deleteTargets[0].total_open_cents)}) sai desta conferência e do painel.
            </p>
          ) : (
            <p>
              As cobranças selecionadas ({formatCents(deleteTargets.reduce((s, c) => s + c.total_open_cents, 0))}) saem desta conferência e do painel.
            </p>
          )}
          <p>Isso não pode ser desfeito. Para cobrar de novo, importe o relatório outra vez.</p>
          {isAdmin ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5">
              <input type="checkbox" className="mt-0.5 size-4" checked={deleteHistory} onChange={(e) => setDeleteHistory(e.target.checked)} />
              <span>
                Apagar também o histórico de envios {deleteTargets.length === 1 ? 'desta cobrança' : 'dessas cobranças'}
                {deleteTargetsSent > 0 && <span className="text-ink-3"> ({deleteTargetsSent} já {deleteTargetsSent === 1 ? 'foi enviada' : 'foram enviadas'})</span>}
              </span>
            </label>
          ) : (
            deleteTargetsSent > 0 && <p className="text-ink-3">O histórico das mensagens já enviadas é mantido.</p>
          )}
        </div>
      </Modal>

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
          As {charges.length} cobranças desta conferência{importRow.storage_path ? ' e o PDF arquivado' : ''} serão apagadas. O histórico de mensagens já enviadas é mantido (pode ser apagado em Histórico).
        </p>
      </Modal>
    </div>
  )
}

function FilterBox({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-ink-3">{label}</span>
      {children}
    </label>
  )
}

function SortButton({ active, dir, onClick, align, title, children }: { active: boolean; dir: 'asc' | 'desc'; onClick: () => void; align?: 'right'; title?: string; children: React.ReactNode }) {
  const Icon = dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? 'Ordenar'}
      className={cx('inline-flex items-center gap-1 rounded font-medium hover:text-ink', align === 'right' && 'flex-row-reverse', active && 'text-ink')}
    >
      {children}
      <Icon className={cx('size-3 shrink-0', active ? 'opacity-100' : 'opacity-0')} aria-hidden />
    </button>
  )
}
