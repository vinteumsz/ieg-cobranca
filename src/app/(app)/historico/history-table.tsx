'use client'

import { CheckCheck, FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { Badge, Modal, type Tone } from '@/components/ui'
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

export function HistoryTable({ rows }: { rows: DispatchRow[] }) {
  const [open, setOpen] = useState<DispatchRow | null>(null)
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed text-sm">
          <colgroup>
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
              {['Data', 'Horário', 'Responsável', 'Aluno', 'Valor', 'Canal', 'WhatsApp', 'E-mail', 'Status', 'Funcionário'].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 font-medium ${i === 0 ? 'pl-5' : ''} ${h === 'Valor' ? 'text-right' : ''}`}>
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
                <tr key={d.id} className="cursor-pointer align-top hover:bg-subtle" onClick={() => setOpen(d)}>
                  <td className="py-3 pr-3 pl-5 whitespace-nowrap tabular">{t.date}</td>
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
        <Modal open onClose={() => setOpen(null)} title={`${open.guardian_name} · ${open.student_name}`} size="lg">
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
    </>
  )
}
