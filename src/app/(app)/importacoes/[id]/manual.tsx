'use client'

// Envio manual assistido: o sistema abre o WhatsApp/e-mail com contato e mensagem prontos;
// o funcionário envia e depois confirma para registrar no histórico.

import { AlertTriangle, ArrowRight, Ban, Check, CheckCircle2, Copy, Mail, MessageCircle, SkipForward, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/toast'
import { apiFetch, Badge, Button, cx, Modal, Notice } from '@/components/ui'
import { composeMessages, type ComposeSettings } from '@/lib/billing/compose'
import { hasCritical } from '@/lib/billing/rules'
import { formatCents, formatDateTime, formatPhone } from '@/lib/format'
import { emailUrl, isMobileDevice, loadPrefs, openLink, savePrefs, whatsappUrl, type OpenPrefs } from '@/lib/open-links'
import type { ChargeRow } from '@/lib/types'

export type Channel = 'whatsapp' | 'email'

export function useOpenPrefs() {
  const [prefs, setPrefs] = useState<OpenPrefs>({ wa: 'web', mail: 'padrao' })
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    setPrefs(loadPrefs())
    setMobile(isMobileDevice(navigator.userAgent))
  }, [])
  const update = (p: OpenPrefs) => {
    setPrefs(p)
    savePrefs(p)
  }
  return { prefs, update, mobile }
}

export function openChannel(channel: Channel, charge: ChargeRow, compose: ComposeSettings, prefs: OpenPrefs, mobile: boolean) {
  const m = composeMessages(charge, compose)
  if (channel === 'whatsapp' && charge.guardian_phone) {
    openLink(whatsappUrl(charge.guardian_phone, m.whatsapp.preview, prefs.wa, mobile), 'ieg-whatsapp')
  }
  if (channel === 'email' && charge.guardian_email) {
    openLink(emailUrl(charge.guardian_email, m.email.subject, m.email.body, prefs.mail), 'ieg-email')
  }
}

export function canSend(c: ChargeRow): { ok: boolean; reason?: string } {
  if (c.status === 'cancelado') return { ok: false, reason: 'Cobrança cancelada.' }
  if (hasCritical(c.warnings) && !c.reviewed) return { ok: false, reason: 'Confira os alertas e marque como conferido antes de enviar.' }
  return { ok: true }
}

export function PrefsPicker({ prefs, onChange, mobile, channels }: { prefs: OpenPrefs; onChange: (p: OpenPrefs) => void; mobile: boolean; channels: Channel[] }) {
  const sel = 'h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink focus:border-brand-strong focus:outline-none'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-3">
      {channels.includes('whatsapp') && !mobile && (
        <label className="flex items-center gap-1.5">
          WhatsApp:
          <select className={sel} value={prefs.wa} onChange={(e) => onChange({ ...prefs, wa: e.target.value === 'app' ? 'app' : 'web' })}>
            <option value="web">WhatsApp Web</option>
            <option value="app">aplicativo</option>
          </select>
        </label>
      )}
      {channels.includes('email') && (
        <label className="flex items-center gap-1.5">
          E-mail:
          <select className={sel} value={prefs.mail} onChange={(e) => onChange({ ...prefs, mail: e.target.value as OpenPrefs['mail'] })}>
            <option value="padrao">programa padrão</option>
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
          </select>
        </label>
      )}
    </div>
  )
}

export async function copyText(text: string, toast: (t: string, tone?: 'ok' | 'bad' | 'info') => void) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Mensagem copiada.', 'info')
  } catch {
    toast('Não foi possível copiar. Selecione o texto da prévia e copie manualmente.', 'bad')
  }
}

async function registerSend(id: string, channels: Channel[], batchId?: string) {
  return apiFetch<{ charge: ChargeRow; sentAt: string }>(`/api/charges/${id}/registrar`, { method: 'POST', json: { channels, batchId } })
}

// ─── Ações no detalhe de uma cobrança ──────────────────────────────────────

export function ManualDrawerActions({
  charge, compose, recentAt, onRegistered,
}: { charge: ChargeRow; compose: ComposeSettings; recentAt: string | null; onRegistered: (c: ChargeRow, sentAt: string) => void }) {
  const toast = useToast()
  const { prefs, update, mobile } = useOpenPrefs()
  const [opened, setOpened] = useState<Channel[]>([])
  const [confirmDup, setConfirmDup] = useState<Channel | null>(null)
  const [busy, setBusy] = useState(false)
  const allowed = canSend(charge)

  function open(channel: Channel, skipDupCheck = false) {
    if (recentAt && !skipDupCheck && opened.length === 0) {
      setConfirmDup(channel)
      return
    }
    openChannel(channel, charge, compose, prefs, mobile)
    setOpened((o) => (o.includes(channel) ? o : [...o, channel]))
  }

  async function register() {
    setBusy(true)
    try {
      const r = await registerSend(charge.id, opened)
      onRegistered(r.charge, r.sentAt)
      setOpened([])
      toast('Envio registrado no histórico.')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {opened.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-line bg-brand-soft px-3 py-2.5 text-sm">
          <span>
            Enviou pelo {opened.map((c) => (c === 'whatsapp' ? 'WhatsApp' : 'e-mail')).join(' e pelo ')}? Confirme para registrar no histórico.
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpened([])}>Ainda não</Button>
            <Button size="sm" variant="brand" icon={<Check className="size-4" />} loading={busy} onClick={register}>
              Sim, registrar envio
            </Button>
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={opened.includes('whatsapp') ? 'secondary' : 'brand'}
          icon={<MessageCircle className="size-4" />}
          disabled={!allowed.ok || !charge.guardian_phone}
          title={!charge.guardian_phone ? 'Sem celular' : allowed.reason}
          onClick={() => open('whatsapp')}
        >
          Abrir no WhatsApp
        </Button>
        <Button
          variant="secondary"
          icon={<Mail className="size-4" />}
          disabled={!allowed.ok || !charge.guardian_email}
          title={!charge.guardian_email ? 'Sem e-mail' : allowed.reason}
          onClick={() => open('email')}
        >
          Abrir e-mail
        </Button>
        <div className="ml-auto">
          <PrefsPicker prefs={prefs} onChange={update} mobile={mobile} channels={['whatsapp', 'email']} />
        </div>
      </div>

      <Modal
        open={!!confirmDup}
        onClose={() => setConfirmDup(null)}
        title="Cobrança recente"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDup(null)}>Cancelar</Button>
            <Button
              variant="brand"
              onClick={() => {
                const c = confirmDup!
                setConfirmDup(null)
                open(c, true)
              }}
            >
              Sim, enviar novamente
            </Button>
          </>
        }
      >
        <p className="text-[15px]">
          Este responsável recebeu uma cobrança em <strong>{recentAt ? formatDateTime(recentAt).date : ''}</strong>. Deseja enviar novamente?
        </p>
      </Modal>
    </div>
  )
}

// ─── Fila para os selecionados ─────────────────────────────────────────────

type ItemState = 'enviado' | 'pulado'

export function ManualQueue({
  charges, channels, compose, recent, onRegistered, onClose,
}: {
  charges: ChargeRow[]
  channels: Channel[]
  compose: ComposeSettings
  recent: Record<string, string>
  onRegistered: (c: ChargeRow, sentAt: string) => void
  onClose: () => void
}) {
  const toast = useToast()
  const { prefs, update, mobile } = useOpenPrefs()
  const batchId = useMemo(() => crypto.randomUUID(), [])
  const [phase, setPhase] = useState<'resumo' | 'fila' | 'fim'>('resumo')
  const [index, setIndex] = useState(0)
  const [opened, setOpened] = useState<Channel[]>([])
  const [states, setStates] = useState<Record<string, ItemState>>({})
  const [busy, setBusy] = useState(false)

  const usable = (c: ChargeRow) => channels.some((ch) => (ch === 'whatsapp' ? !!c.guardian_phone : !!c.guardian_email))
  // A fila é montada uma vez, na abertura, para não mudar de ordem enquanto o funcionário envia.
  const [snapshot] = useState(() => ({
    queue: charges.filter((c) => canSend(c).ok && usable(c)),
    blocked: charges.filter((c) => !canSend(c).ok),
    noContact: charges.filter((c) => canSend(c).ok && !usable(c)),
  }))
  const { queue, blocked, noContact } = snapshot
  const wa = channels.includes('whatsapp') ? queue.filter((c) => c.guardian_phone).length : 0
  const em = channels.includes('email') ? queue.filter((c) => c.guardian_email).length : 0
  const semEmail = channels.includes('email') ? queue.filter((c) => !c.guardian_email).length : 0
  const semCelular = channels.includes('whatsapp') ? queue.filter((c) => !c.guardian_phone).length : 0
  const dupes = queue.filter((c) => recent[c.group_key])

  const current = queue[index]
  const msgs = current ? composeMessages(current, compose) : null
  const doneCount = Object.values(states).filter((s) => s === 'enviado').length
  const skipCount = Object.values(states).filter((s) => s === 'pulado').length

  function next(state: ItemState) {
    if (!current) return
    setStates((s) => ({ ...s, [current.id]: state }))
    setOpened([])
    if (index + 1 >= queue.length) setPhase('fim')
    else setIndex(index + 1)
  }

  async function registerAndNext() {
    if (!current) return
    setBusy(true)
    try {
      const r = await registerSend(current.id, opened, batchId)
      onRegistered(r.charge, r.sentAt)
      next('enviado')
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const channelName = channels.length === 2 ? 'WhatsApp e e-mail' : channels[0] === 'whatsapp' ? 'WhatsApp' : 'e-mail'

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={phase === 'fim' ? 'Envio concluído' : phase === 'fila' ? `Enviar cobranças · ${index + 1} de ${queue.length}` : 'Confirmar envio de cobranças'}
      footer={
        phase === 'resumo' ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="brand" icon={<ArrowRight className="size-4" />} disabled={queue.length === 0} onClick={() => setPhase('fila')}>
              Começar
            </Button>
          </>
        ) : phase === 'fila' ? (
          <>
            <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => next('pulado')}>Pular</Button>
            <Button variant="brand" icon={<Check className="size-4" />} loading={busy} disabled={opened.length === 0} onClick={registerAndNext}>
              {index + 1 >= queue.length ? 'Registrar envio e concluir' : 'Registrar envio e ir para o próximo'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>Fechar</Button>
        )
      }
    >
      {phase === 'resumo' && (
        <div className="space-y-4">
          <p className="font-display text-lg font-semibold">
            Você está prestes a enviar {queue.length} {queue.length === 1 ? 'mensagem' : 'mensagens'} de cobrança.
          </p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {channels.includes('whatsapp') && <Stat icon={<MessageCircle className="size-4" />} value={wa} label={wa === 1 ? 'WhatsApp' : 'WhatsApps'} />}
            {channels.includes('email') && <Stat icon={<Mail className="size-4" />} value={em} label={em === 1 ? 'e-mail' : 'e-mails'} />}
            {semEmail > 0 && <Stat icon={<UserX className="size-4" />} value={semEmail} label={semEmail === 1 ? 'responsável sem e-mail' : 'responsáveis sem e-mail'} muted />}
            {semCelular > 0 && <Stat icon={<UserX className="size-4" />} value={semCelular} label={semCelular === 1 ? 'responsável sem celular' : 'responsáveis sem celular'} muted />}
          </ul>
          <p className="text-sm text-ink-2">
            O sistema vai abrir o {channelName} de cada responsável com a mensagem pronta, um de cada vez. Você confere, envia e confirma aqui para registrar no histórico.
          </p>
          {dupes.length > 0 && (
            <Notice tone="warn" icon={<AlertTriangle className="size-4 text-warn" />} title={`${dupes.length} ${dupes.length === 1 ? 'responsável recebeu' : 'responsáveis receberam'} cobrança recentemente`}>
              Eles aparecem com um aviso na fila; você decide se envia de novo ou pula.
            </Notice>
          )}
          {blocked.length > 0 && (
            <Notice tone="bad" icon={<Ban className="size-4 text-bad" />} title={`${blocked.length} ${blocked.length === 1 ? 'cobrança ficará' : 'cobranças ficarão'} de fora`}>
              {blocked.map((c) => `${c.guardian_name} (${canSend(c).reason?.startsWith('Cobrança') ? 'cancelada' : 'alerta não conferido'})`).join(' · ')}
            </Notice>
          )}
          {noContact.length > 0 && (
            <Notice title={`${noContact.length} sem contato para o canal escolhido`}>{noContact.map((c) => c.guardian_name).join(' · ')}</Notice>
          )}
          <PrefsPicker prefs={prefs} onChange={update} mobile={mobile} channels={channels} />
        </div>
      )}

      {phase === 'fila' && current && msgs && (
        <div className="space-y-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}>
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(index / queue.length) * 100}%` }} />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold">{current.guardian_name}</p>
              <p className="text-sm text-ink-2">
                Aluno(a): {current.student_name}
                {current.class_name ? ` · ${current.class_name}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-semibold tabular">{formatCents(current.total_open_cents)}</p>
              <p className="text-xs text-ink-3">{current.open_count} parcela(s)</p>
            </div>
          </div>

          {recent[current.group_key] && (
            <Notice tone="warn" icon={<AlertTriangle className="size-4 text-warn" />} title={`Este responsável recebeu uma cobrança em ${formatDateTime(recent[current.group_key]).date}. Deseja enviar novamente?`}>
              Se não quiser, clique em “Pular”.
            </Notice>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {channels.includes('whatsapp') && (
              <OpenCard
                icon={<MessageCircle className="size-4" />}
                title="WhatsApp"
                contact={current.guardian_phone ? formatPhone(current.guardian_phone) : null}
                opened={opened.includes('whatsapp')}
                onOpen={() => {
                  openChannel('whatsapp', current, compose, prefs, mobile)
                  setOpened((o) => (o.includes('whatsapp') ? o : [...o, 'whatsapp']))
                }}
                onCopy={() => copyText(msgs.whatsapp.preview, toast)}
              />
            )}
            {channels.includes('email') && (
              <OpenCard
                icon={<Mail className="size-4" />}
                title="E-mail"
                contact={current.guardian_email}
                opened={opened.includes('email')}
                onOpen={() => {
                  openChannel('email', current, compose, prefs, mobile)
                  setOpened((o) => (o.includes('email') ? o : [...o, 'email']))
                }}
                onCopy={() => copyText(`${msgs.email.subject}\n\n${msgs.email.body}`, toast)}
              />
            )}
          </div>

          <details className="rounded-lg border border-line bg-subtle text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium">Ver a mensagem</summary>
            <pre className="max-h-60 overflow-auto border-t border-line px-3 py-2.5 font-sans whitespace-pre-wrap text-ink-2">
              {channels.includes('whatsapp') && current.guardian_phone ? msgs.whatsapp.preview : `${msgs.email.subject}\n\n${msgs.email.body}`}
            </pre>
          </details>

          <p className="text-xs text-ink-3">
            {opened.length === 0
              ? 'Abra o WhatsApp ou o e-mail, envie a mensagem e volte aqui para registrar.'
              : 'Depois de enviar, confirme abaixo para registrar no histórico.'}
          </p>
        </div>
      )}

      {phase === 'fim' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-7 text-ok" />
            <p className="text-[15px]">
              <strong>{doneCount}</strong> {doneCount === 1 ? 'envio registrado' : 'envios registrados'}
              {skipCount > 0 && <> · {skipCount} {skipCount === 1 ? 'pulado' : 'pulados'}</>}.
            </p>
          </div>
          {skipCount > 0 && (
            <p className="text-sm text-ink-2">
              Os pulados continuam como pendentes na conferência:{' '}
              {queue.filter((c) => states[c.id] === 'pulado').map((c) => c.guardian_name).join(', ')}.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

function OpenCard({ icon, title, contact, opened, onOpen, onCopy }: { icon: React.ReactNode; title: string; contact: string | null; opened: boolean; onOpen: () => void; onCopy: () => void }) {
  return (
    <div className={cx('rounded-xl border p-3', opened ? 'border-ok/40 bg-ok-soft' : 'border-line bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="text-brand-strong">{icon}</span>
          {title}
        </span>
        {opened && <Badge tone="ok" icon={<Check className="size-3" />}>aberto</Badge>}
      </div>
      <p className="mt-1 truncate text-sm text-ink-2">{contact ?? <span className="text-ink-3">sem contato</span>}</p>
      {contact && (
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" variant={opened ? 'secondary' : 'primary'} onClick={onOpen}>
            {opened ? 'Abrir de novo' : `Abrir ${title === 'E-mail' ? 'e-mail' : 'WhatsApp'}`}
          </Button>
          <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={onCopy}>
            Copiar
          </Button>
        </div>
      )}
    </div>
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
