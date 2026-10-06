'use client'

import { CheckCheck, FlaskConical, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/toast'
import { apiFetch, Badge, Button, cx, Modal, type Tone } from '@/components/ui'
import { formatCents, formatDateTime, formatPhone } from '@/lib/format'
import type { DispatchRow, MessageRow } from '@/lib/types'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  enviado: { label: 'Enviado', tone: 'accent' },
  entregue: { label: 'Entregue', tone: 'ok' },
  lido: { label: 'Lido', tone: 'ok' },
  erro: { label: 'Erro', tone: 'bad' },
  pendente: { label: 'Pendente', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
  simulado: { label: 'Teste', tone: 'brand' },
}

function S({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as Tone }
  return (
    <Badge tone={s.tone} icon={status === 'simulado' ? <FlaskConical className="size-3" /> : status === 'lido' ? <CheckCheck className="size-3" /> : undefined}>
      {s.label}
    </Badge>
  )
}

const channelLabel = (d: DispatchRow) =>
  d.channels.length === 2 ? 'WhatsApp + e-mail' : d.channels[0] === 'whatsapp' ? 'WhatsApp' : d.channels[0] === 'email' ? 'E-mail' : '—'

function Recipient({ m }: { m: MessageRow | undefined }) {
  if (!m) return <span className="text-ink-3">—</span>
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="block w-full truncate text-[13px] text-ink-2">{m.channel === 'whatsapp' ? formatPhone(m.recipient) : m.recipient}</span>
      <S status={m.status} />
    </div>
  )
}

export function HistoryTable({ rows: initialRows, canDelete }: { rows: DispatchRow[]; canDelete: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initialRows)
  useEffect(() => setRows(initialRows), [initialRows])
  const [open, setOpen] = useState<DispatchRow | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function remove() {
    if (!confirm) return
    setDeleting(true)
    try {
      const r = await apiFetch<{ deleted: string[] }>('/api/dispatches', { method: 'DELETE', json: { ids: confirm } })
      const gone = new Set(r.deleted)
      setRows((rs) => rs.filter((d) => !gone.has(d.id)))
      setSelected((s) => new Set([...s].filter((id) => !gone.has(id))))
      if (open && gone.has(open.id)) setOpen(null)
      toast(r.deleted.length === 1 ? 'Envio apagado do histórico.' : `${r.deleted.length} envios apagados do histórico.`)
      setConfirm(null)
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setDeleting(false)
    }
  }

  const targets = confirm ? rows.filter((d) => confirm.includes(d.id)) : []
  const targetsLinked = targets.filter((d) => d.charge_id && d.status !== 'cancelado').length

  return (
    <>
      {canDelete && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-brand-soft/60 px-5 py-2.5 text-sm">
          <span>
            <strong>{selected.size}</strong> selecionado{selected.size === 1 ? '' : 's'}
            <button className="ml-3 text-ink-3 underline underline-offset-2 hover:text-ink" onClick={() => setSelected(new Set())}>
              Limpar
            </button>
          </span>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm([...selected])}>
            Apagar selecionados
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={cx('w-full table-fixed text-sm', canDelete ? 'min-w-[1080px]' : 'min-w-[1040px]')}>
          <colgroup>
            {canDelete && <col className="w-11" />}
            <col className="w-[104px]" />
            <col className="w-16" />
            <col className="w-[16%]" />
            <col className="w-[13%]" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-[136px]" />
            <col className="w-[16%]" />
            <col className="w-24" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-subtle text-left text-xs text-ink-3">
              {canDelete && (
                <th className="py-2.5 pl-5">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="Selecionar todos desta página"
                  />
                </th>
              )}
              {['Data', 'Horário', 'Responsável', 'Aluno', 'Valor', 'Canal', 'WhatsApp', 'E-mail', 'Status', 'Funcionário'].map((h, i) => (
                <th key={h} className={cx('px-3 py-2.5 font-medium', i === 0 && !canDelete && 'pl-5', h === 'Valor' && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((d) => {
              const t = formatDateTime(d.created_at)
              const wa = d.messages?.find((m) => m.channel === 'whatsapp')
              const em = d.messages?.find((m) => m.channel === 'email')
              return (
                <tr key={d.id} className={cx('cursor-pointer align-top hover:bg-subtle', selected.has(d.id) && 'bg-brand-soft/60')} onClick={() => setOpen(d)}>
                  {canDelete && (
                    <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="mt-0.5 size-4" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Selecionar envio para ${d.guardian_name}`} />
                    </td>
                  )}
                  <td className={cx('py-3 pr-3 whitespace-nowrap tabular', canDelete ? 'pl-3' : 'pl-5')}>{t.date}</td>
                  <td className="px-3 py-3 tabular text-ink-2">{t.time}</td>
                  <td className="truncate px-3 py-3 font-medium">{d.guardian_name}</td>
                  <td className="truncate px-3 py-3 text-ink-2">{d.student_name}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular">{formatCents(d.amount_cents)}</td>
                  <td className="px-3 py-3 text-ink-2">{channelLabel(d)}</td>
                  <td className="px-3 py-3"><Recipient m={wa} /></td>
                  <td className="px-3 py-3"><Recipient m={em} /></td>
                  <td className="px-3 py-3"><S status={d.status} /></td>
                  <td className="truncate px-3 py-3 text-ink-2">{d.sent_by_name ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={`${open.guardian_name} · ${open.student_name}`}
          size="lg"
          footer={
            canDelete ? (
              <Button variant="danger-ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirm([open.id])}>
                Apagar este envio
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-2">
              {formatDateTime(open.created_at).date} às {formatDateTime(open.created_at).time} · {formatCents(open.amount_cents)} · por {open.sent_by_name ?? '—'}
              {open.test_mode && ' · modo de testes'}
            </p>
            {open.note && <p className="rounded-lg bg-subtle px-3 py-2">{open.note}</p>}
            {(open.messages ?? []).map((m) => (
              <div key={m.id} className="rounded-xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2.5">
                  <span className="font-medium">
                    {m.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'} para {m.channel === 'whatsapp' ? formatPhone(m.recipient) : m.recipient}
                    {m.intended_recipient && m.intended_recipient !== m.recipient && (
                      <span className="font-normal text-ink-3"> (responsável: {m.channel === 'whatsapp' ? formatPhone(m.intended_recipient) : m.intended_recipient})</span>
                    )}
                  </span>
                  <S status={m.status} />
                </div>
                {m.error_message && <p className="border-b border-line bg-bad-soft px-4 py-2 text-bad">{m.error_message}</p>}
                {m.subject && <p className="border-b border-line px-4 py-2"><span className="text-ink-3">Assunto:</span> {m.subject}</p>}
                <pre className="max-h-64 overflow-auto px-4 py-3 font-sans whitespace-pre-wrap text-ink-2">{m.body}</pre>
                <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
                  {m.sent_at && `Enviada ${formatDateTime(m.sent_at).date} ${formatDateTime(m.sent_at).time}`}
                  {m.delivered_at && ` · entregue ${formatDateTime(m.delivered_at).time}`}
                  {m.read_at && ` · lida ${formatDateTime(m.read_at).time}`}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <Modal
        open={!!confirm}
        onClose={() => !deleting && setConfirm(null)}
        title={targets.length === 1 ? 'Apagar este envio do histórico?' : `Apagar ${targets.length} envios do histórico?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirm(null)}>Voltar</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={deleting} onClick={remove}>Apagar</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {targets.length === 1 && (
            <p>
              Envio para <strong className="text-ink">{targets[0].guardian_name}</strong> (aluno(a) {targets[0].student_name}) em {formatDateTime(targets[0].created_at).date}.
            </p>
          )}
          <p>O registro e o texto das mensagens serão apagados. Isso não pode ser desfeito.</p>
          {targetsLinked > 0 && (
            <p>
              Se a cobrança ainda estiver na conferência, ela volta a aparecer como <strong className="text-ink">pendente</strong> (ou com o status do último envio que restar), e o aviso de “já cobrado” some.
            </p>
          )}
          <p className="text-xs text-ink-3">A exclusão fica registrada nos logs de acesso.</p>
        </div>
      </Modal>
    </>
  )
}
