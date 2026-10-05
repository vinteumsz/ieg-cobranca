'use client'

import { AlertTriangle, CheckCircle2, FlaskConical, Mail, MessageCircle, UserX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, Button, Modal, Notice } from '@/components/ui'
import { formatCents, formatDateTime } from '@/lib/format'

export type Channel = 'whatsapp' | 'email'

type PreflightItem = {
  id: string
  guardian_name: string
  student_name: string
  total_open_cents: number
  phone: boolean
  email: boolean
  blocked: null | 'cancelada' | 'alerta'
  lastSentAt: string | null
}
type Readiness = { ok: boolean; reason?: string; simulate?: boolean }
type Preflight = {
  items: PreflightItem[]
  ready: Record<Channel, Readiness>
  testMode: boolean
  testTargets: { whatsapp: string | null; email: string | null }
  windowDays: number
}
type ChannelResult = { status: string; error?: string; recipient?: string }
type ChargeResult = { chargeId: string; skipped?: string; lastSentAt?: string; whatsapp?: ChannelResult; email?: ChannelResult }

const CHUNK = 5
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

const SKIP_LABEL: Record<string, string> = {
  cancelada: 'cobrança cancelada',
  alerta: 'alerta não conferido',
  duplicada: 'cobrada recentemente',
  ja_processada: 'já processada neste envio',
  nao_encontrada: 'não encontrada',
}

export function SendDialog({ ids, channels, onClose, onFinished }: { ids: string[]; channels: Channel[]; onClose: () => void; onFinished: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'confirm' | 'sending' | 'done' | 'error'>('checking')
  const [pf, setPf] = useState<Preflight | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [includeDupes, setIncludeDupes] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ChargeResult[]>([])
  const stop = useRef(false)
  const batchId = useMemo(() => crypto.randomUUID(), [])
  const single = ids.length === 1

  useEffect(() => {
    apiFetch<Preflight>('/api/send/preflight', { method: 'POST', json: { chargeIds: ids } })
      .then((d) => {
        setPf(d)
        setPhase('confirm')
      })
      .catch((e) => {
        setError(e.message)
        setPhase('error')
      })
  }, [ids])

  const view = useMemo(() => {
    if (!pf) return null
    const wantWa = channels.includes('whatsapp')
    const wantEmail = channels.includes('email')
    const eligible = pf.items.filter((i) => !i.blocked)
    const dupes = eligible.filter((i) => i.lastSentAt)
    const toSend = includeDupes || single ? eligible : eligible.filter((i) => !i.lastSentAt)
    const wa = wantWa ? toSend.filter((i) => i.phone).length : 0
    const em = wantEmail ? toSend.filter((i) => i.email).length : 0
    const reachable = toSend.filter((i) => (wantWa && i.phone) || (wantEmail && i.email))
    const channelProblems = channels.filter((c) => !pf.ready[c].ok).map((c) => pf.ready[c].reason!)
    return {
      wantWa, wantEmail, eligible, dupes, toSend, reachable, wa, em, channelProblems,
      noPhone: wantWa ? toSend.filter((i) => !i.phone).length : 0,
      noEmail: wantEmail ? toSend.filter((i) => !i.email).length : 0,
      alert: pf.items.filter((i) => i.blocked === 'alerta'),
      cancelled: pf.items.filter((i) => i.blocked === 'cancelada'),
      simulate: channels.some((c) => pf.ready[c].simulate),
    }
  }, [pf, channels, includeDupes, single])

  async function confirm() {
    if (!view) return
    const list = view.reachable.map((i) => i.id)
    const allowResend = single || includeDupes ? view.dupes.map((d) => d.id) : []
    setPhase('sending')
    setProgress({ done: 0, total: list.length })
    const all: ChargeResult[] = []
    for (let i = 0; i < list.length; i += CHUNK) {
      if (stop.current) break
      const chunk = list.slice(i, i + CHUNK)
      try {
        const r = await apiFetch<{ results: ChargeResult[] }>('/api/send', {
          method: 'POST',
          json: { batchId, chargeIds: chunk, channels, allowResend, confirmed: true },
        })
        all.push(...r.results)
      } catch (e) {
        all.push(...chunk.map((id) => ({ chargeId: id, whatsapp: { status: 'erro', error: (e as Error).message } })))
      }
      setResults([...all])
      setProgress({ done: Math.min(i + CHUNK, list.length), total: list.length })
    }
    setPhase('done')
  }

  const nameOf = (id: string) => {
    const it = pf?.items.find((i) => i.id === id)
    return it ? `${it.guardian_name} (${it.student_name})` : id
  }

  const count = (st: string) => results.reduce((n, r) => n + (r.whatsapp?.status === st ? 1 : 0) + (r.email?.status === st ? 1 : 0), 0)
  const errors = results.flatMap((r) =>
    (['whatsapp', 'email'] as Channel[]).filter((c) => r[c]?.status === 'erro').map((c) => ({ id: r.chargeId, channel: c, error: r[c]?.error ?? 'Erro' })),
  )
  const skipped = results.filter((r) => r.skipped)

  const first = pf?.items[0]
  const channelLabel = channels.length === 2 ? 'WhatsApp e e-mail' : channels[0] === 'whatsapp' ? 'WhatsApp' : 'e-mail'

  return (
    <Modal
      open
      onClose={phase === 'sending' ? () => {} : phase === 'done' ? onFinished : onClose}
      title={phase === 'done' ? 'Envio concluído' : single ? 'Confirmar envio' : 'Confirmar envio de cobranças'}
      size="lg"
      footer={
        phase === 'confirm' && view ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button
              variant="brand"
              onClick={confirm}
              disabled={view.reachable.length === 0 || view.channelProblems.length > 0}
              icon={single && first?.lastSentAt ? undefined : channels.length === 2 ? undefined : channels[0] === 'whatsapp' ? <MessageCircle className="size-4" /> : <Mail className="size-4" />}
            >
              {single && first?.lastSentAt ? 'Sim, enviar novamente' : 'Confirmar envio'}
            </Button>
          </>
        ) : phase === 'sending' ? (
          <Button variant="ghost" onClick={() => (stop.current = true)}>Interromper após o lote atual</Button>
        ) : phase === 'done' ? (
          <Button variant="primary" onClick={onFinished}>Fechar</Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        )
      }
    >
      {phase === 'checking' && <p className="py-6 text-center text-sm text-ink-3">Verificando contatos e envios recentes…</p>}
      {phase === 'error' && <Notice tone="bad" title="Não foi possível preparar o envio">{error}</Notice>}

      {phase === 'confirm' && view && pf && (
        <div className="space-y-4">
          {single && first ? (
            <p className="text-[15px]">
              Você está prestes a enviar a cobrança de <strong>{first.guardian_name}</strong> (aluno(a) {first.student_name}),
              no valor de <strong>{formatCents(first.total_open_cents)}</strong>, por <strong>{channelLabel}</strong>.
            </p>
          ) : (
            <p className="font-display text-lg font-semibold">
              Você está prestes a enviar {plural(view.reachable.length, 'mensagem', 'mensagens')} de cobrança.
            </p>
          )}

          <ul className="grid gap-2 sm:grid-cols-3">
            {view.wantWa && <Stat icon={<MessageCircle className="size-4" />} label={view.wa === 1 ? 'WhatsApp' : 'WhatsApps'} value={view.wa} />}
            {view.wantEmail && <Stat icon={<Mail className="size-4" />} label={view.em === 1 ? 'e-mail' : 'e-mails'} value={view.em} />}
            {view.wantEmail && view.noEmail > 0 && <Stat icon={<UserX className="size-4" />} label={view.noEmail === 1 ? 'responsável sem e-mail' : 'responsáveis sem e-mail'} value={view.noEmail} muted />}
            {view.wantWa && view.noPhone > 0 && <Stat icon={<UserX className="size-4" />} label={view.noPhone === 1 ? 'responsável sem celular' : 'responsáveis sem celular'} value={view.noPhone} muted />}
          </ul>

          {single && first?.lastSentAt && (
            <Notice tone="warn" icon={<AlertTriangle className="size-4 text-warn" />} title={`Este responsável recebeu uma cobrança em ${formatDateTime(first.lastSentAt).date}. Deseja enviar novamente?`} />
          )}

          {!single && view.dupes.length > 0 && (
            <Notice tone="warn" icon={<AlertTriangle className="size-4 text-warn" />} title={`${plural(view.dupes.length, 'responsável recebeu', 'responsáveis receberam')} cobrança nos últimos ${pf.windowDays} dias`}>
              <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-sm">
                {view.dupes.map((d) => (
                  <li key={d.id}>
                    {d.guardian_name} — {formatDateTime(d.lastSentAt!).date}
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} className="size-4" />
                Enviar novamente para {view.dupes.length === 1 ? 'este responsável' : 'estes responsáveis'}
              </label>
            </Notice>
          )}

          {view.alert.length > 0 && (
            <Notice tone="bad" title={`${plural(view.alert.length, 'cobrança com alerta não conferida será ignorada', 'cobranças com alerta não conferidas serão ignoradas')}`}>
              Abra cada uma, confira os dados e clique em “Marcar como conferido”.
            </Notice>
          )}
          {view.cancelled.length > 0 && <Notice>{plural(view.cancelled.length, 'cobrança cancelada será ignorada', 'cobranças canceladas serão ignoradas')}.</Notice>}
          {view.channelProblems.map((p) => (
            <Notice key={p} tone="bad" title="Canal não configurado">{p}</Notice>
          ))}
          {pf.testMode && (
            <Notice tone="brand" icon={<FlaskConical className="size-4 text-brand-strong" />} title="Modo de testes">
              {view.simulate
                ? 'Nada será enviado de verdade: o envio será apenas simulado e registrado no histórico como teste.'
                : `As mensagens irão para o contato de teste${pf.testTargets.whatsapp ? ` (WhatsApp ${pf.testTargets.whatsapp})` : ''}${pf.testTargets.email ? ` (e-mail ${pf.testTargets.email})` : ''}, e não para os responsáveis.`}
            </Notice>
          )}
        </div>
      )}

      {(phase === 'sending' || phase === 'done') && (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>{phase === 'sending' ? 'Enviando…' : 'Concluído'}</span>
              <span className="tabular text-ink-3">
                {progress.done} de {progress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
          {phase === 'done' && (
            <>
              <ul className="grid gap-2 sm:grid-cols-3">
                <Stat icon={<CheckCircle2 className="size-4" />} label="enviadas" value={count('enviado')} />
                {count('simulado') > 0 && <Stat icon={<FlaskConical className="size-4" />} label="de teste" value={count('simulado')} />}
                <Stat icon={<AlertTriangle className="size-4" />} label="com erro" value={errors.length} muted={errors.length === 0} />
              </ul>
              {errors.length > 0 && (
                <Notice tone="bad" title="Mensagens com erro">
                  <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
                    {errors.map((e) => (
                      <li key={e.id + e.channel}>
                        <strong className="font-medium text-ink">{nameOf(e.id)}</strong> · {e.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}: {e.error}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}
              {skipped.length > 0 && (
                <Notice title={`${plural(skipped.length, 'cobrança não enviada', 'cobranças não enviadas')}`}>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                    {skipped.map((s) => (
                      <li key={s.chargeId}>
                        {nameOf(s.chargeId)} — {SKIP_LABEL[s.skipped!] ?? s.skipped}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function Stat({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: number; muted?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-subtle px-3 py-2.5">
      <span className={muted ? 'text-ink-3' : 'text-brand-strong'}>{icon}</span>
      <span className="font-display text-xl font-semibold tabular">{value}</span>
      <span className="text-sm text-ink-2">{label}</span>
    </li>
  )
}
