'use client'

import { AlertTriangle, Ban, CheckCircle2, Clock, Info, Mail, MessageCircle, Pencil, RotateCcw, Send, ShieldCheck, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiFetch, Badge, Button, cx, Drawer, Field, Input, Notice, Textarea } from '@/components/ui'
import { useToast } from '@/components/toast'
import { composeMessages, type ComposeSettings } from '@/lib/billing/compose'
import { hasCritical } from '@/lib/billing/rules'
import { formatCents, formatCpf, formatDateBR, formatDateTime, formatPhone, isValidCpf } from '@/lib/format'
import type { ChargeRow } from '@/lib/types'
import { ChannelBadge, StatusBadge } from './badges'
import type { Channel } from './send-dialog'

type Props = {
  charge: ChargeRow
  compose: ComposeSettings
  recentAt: string | null
  onClose: () => void
  onUpdated: (c: ChargeRow) => void
  onSend: (channels: Channel[]) => void
}

export function ChargeDrawer({ charge, compose, recentAt, onClose, onUpdated, onSend }: Props) {
  const toast = useToast()
  const msgs = useMemo(() => composeMessages(charge, compose), [charge, compose])
  const charged = charge.installments.filter((i) => i.cobrar)
  const upcoming = charge.installments.filter((i) => !i.cobrar)
  const critical = hasCritical(charge.warnings)
  const blocked = (critical && !charge.reviewed) || charge.status === 'cancelado'
  const [busy, setBusy] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>, okText: string) {
    setBusy(String(body.action))
    try {
      const { charge: updated } = await apiFetch<{ charge: ChargeRow }>(`/api/charges/${charge.id}`, { method: 'PATCH', json: body })
      onUpdated(updated)
      toast(okText)
      return true
    } catch (e) {
      toast((e as Error).message, 'bad')
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={charge.guardian_name || 'Responsável não identificado'}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          Aluno(a): {charge.student_name}
          {charge.class_name && <span className="text-ink-3">· {charge.class_name}</span>}
          <StatusBadge status={charge.status} />
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<MessageCircle className="size-4" />}
            disabled={blocked || !charge.guardian_phone}
            title={!charge.guardian_phone ? 'Sem celular' : undefined}
            onClick={() => onSend(['whatsapp'])}
          >
            Enviar WhatsApp
          </Button>
          <Button
            variant="secondary"
            icon={<Mail className="size-4" />}
            disabled={blocked || !charge.guardian_email}
            title={!charge.guardian_email ? 'Sem e-mail' : undefined}
            onClick={() => onSend(['email'])}
          >
            Enviar e-mail
          </Button>
          <Button
            variant="brand"
            icon={<Send className="size-4" />}
            disabled={blocked || !charge.guardian_phone || !charge.guardian_email}
            onClick={() => onSend(['whatsapp', 'email'])}
          >
            Enviar pelos dois canais
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {recentAt && (
          <Notice tone="warn" icon={<Clock className="size-4 text-warn" />}>
            Este responsável recebeu uma cobrança em <strong className="text-ink">{formatDateTime(recentAt).date}</strong>.
          </Notice>
        )}
        {charge.status === 'cancelado' && (
          <Notice title="Cobrança cancelada" icon={<Ban className="size-4 text-ink-3" />}>
            {charge.cancel_reason || 'Sem motivo informado.'}{' '}
            <button className="font-medium text-brand-hover underline underline-offset-2" onClick={() => patch({ action: 'reabrir' }, 'Cobrança reaberta.')}>
              Reabrir
            </button>
          </Notice>
        )}

        <Warnings charge={charge} onReview={(v) => patch({ action: 'conferido', reviewed: v }, v ? 'Marcado como conferido.' : 'Conferência desfeita.')} busy={busy === 'conferido'} />

        <ContactSection charge={charge} busy={busy === 'contato'} onSave={(phone, email) => patch({ action: 'contato', phone, email }, 'Contato atualizado.')} />

        <section>
          <SectionTitle>Mensalidades em aberto</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <ul className="divide-y divide-line">
              {charged.map((i, k) => (
                <li key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">{i.mes}</p>
                    <p className="text-xs text-ink-3">
                      Venc. {formatDateBR(i.vencimento)}
                      {i.receita ? ` · ${i.receita}` : ''}
                      {i.parcela ? ` · parc. ${i.parcela}` : ''}
                      {i.valorPagoCents ? ` · pago ${formatCents(i.valorPagoCents)}` : ''}
                    </p>
                    {i.avisos.map((a) => (
                      <p key={a} className="mt-1 flex items-center gap-1 text-xs text-bad">
                        <AlertTriangle className="size-3" /> {a}
                      </p>
                    ))}
                  </div>
                  <span className="tabular font-medium whitespace-nowrap">{formatCents(i.emAbertoCents)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-line bg-subtle px-4 py-3">
              <span className="font-semibold">Total</span>
              <span className="font-display text-lg font-semibold tabular">{formatCents(charge.total_open_cents)}</span>
            </div>
          </div>

          {msgs.update.configured ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:grid-cols-4">
              <Item k="Valor original" v={formatCents(msgs.update.originalCents)} />
              <Item k="Multa" v={formatCents(msgs.update.fineCents)} />
              <Item k="Juros acumulados" v={formatCents(msgs.update.interestCents)} />
              <Item k={`Atualizado em ${formatDateBR(msgs.update.date)}`} v={formatCents(msgs.update.updatedCents)} strong />
            </dl>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-2">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
              Os valores estão sujeitos à atualização, pois os juros são calculados diariamente.
            </p>
          )}

          {upcoming.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-ink-2">
                {upcoming.length} parcela(s) a vencer — não entram na cobrança
              </summary>
              <ul className="mt-2 space-y-1 pl-4 text-ink-3">
                {upcoming.map((i, k) => (
                  <li key={k}>
                    {i.mes} · venc. {formatDateBR(i.vencimento)} · {formatCents(i.emAbertoCents)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <WhatsAppPreview charge={charge} compose={compose} msgs={msgs} busy={busy === 'mensagem'} onSave={(b, t) => patch({ action: 'mensagem', ...b }, t)} />
        <EmailPreview msgs={msgs} busy={busy === 'mensagem'} onSave={(b, t) => patch({ action: 'mensagem', ...b }, t)} />

        <section className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm text-ink-3">
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">WhatsApp: <ChannelBadge status={charge.wa_status} available={!!charge.guardian_phone} missingLabel="sem celular" /></span>
            <span className="flex items-center gap-1.5">E-mail: <ChannelBadge status={charge.email_status} available={!!charge.guardian_email} missingLabel="sem e-mail" /></span>
          </span>
          {charge.status !== 'cancelado' && <CancelButton busy={busy === 'cancelar'} onConfirm={(reason) => patch({ action: 'cancelar', reason }, 'Cobrança cancelada.')} />}
        </section>
      </div>
    </Drawer>
  )
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">{children}</h3>
      {action}
    </div>
  )
}

function Item({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{k}</dt>
      <dd className={cx('tabular', strong ? 'font-semibold' : '')}>{v}</dd>
    </div>
  )
}

function Warnings({ charge, onReview, busy }: { charge: ChargeRow; onReview: (v: boolean) => void; busy: boolean }) {
  if (!charge.warnings?.length) return null
  const critical = hasCritical(charge.warnings)
  return (
    <section className="space-y-2">
      {charge.warnings.map((w) => (
        <div key={w.code + w.message} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', w.level === 'critico' ? 'bg-bad-soft text-ink' : 'bg-warn-soft text-ink')}>
          <AlertTriangle className={cx('mt-0.5 size-4 shrink-0', w.level === 'critico' ? 'text-bad' : 'text-warn')} />
          {w.message}
        </div>
      ))}
      {critical &&
        (charge.reviewed ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 className="size-4" /> Conferido{charge.reviewed_at ? ` em ${formatDateTime(charge.reviewed_at).date}` : ''}.
            <button className="text-ink-3 underline underline-offset-2" onClick={() => onReview(false)} disabled={busy}>
              Desfazer
            </button>
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
            <span className="text-ink-2">Confira os alertas acima com o relatório. O envio fica bloqueado até a conferência.</span>
            <Button size="sm" variant="primary" icon={<ShieldCheck className="size-4" />} loading={busy} onClick={() => onReview(true)}>
              Marcar como conferido
            </Button>
          </div>
        ))}
    </section>
  )
}

function ContactSection({ charge, onSave, busy }: { charge: ChargeRow; onSave: (phone: string, email: string) => Promise<boolean>; busy: boolean }) {
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState(formatPhone(charge.guardian_phone))
  const [email, setEmail] = useState(charge.guardian_email ?? '')
  const cpfOk = isValidCpf(charge.guardian_cpf)
  return (
    <section>
      <SectionTitle
        action={
          !editing && (
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              Corrigir contato
            </Button>
          )
        }
      >
        Dados
      </SectionTitle>
      {editing ? (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await onSave(phone, email)) setEditing(false)
          }}
        >
          <Field label="Celular (WhatsApp)" htmlFor="ed-phone" hint={charge.guardian_phone_raw ? `No relatório: ${charge.guardian_phone_raw}` : undefined}>
            <Input id="ed-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(83) 99999-9999" inputMode="tel" />
          </Field>
          <Field label="E-mail" htmlFor="ed-email">
            <Input id="ed-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={busy}>Salvar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-line bg-surface px-4 py-4 text-sm sm:grid-cols-2">
          <Item k="Responsável" v={charge.guardian_name || '—'} />
          <Item k="CPF" v={<span className={cpfOk ? '' : 'text-warn'}>{charge.guardian_cpf ? formatCpf(charge.guardian_cpf) : '—'}</span>} />
          <Item k="Aluno(a)" v={charge.student_name} />
          <Item k="Turma" v={charge.class_name || '—'} />
          <Item k="Telefone" v={charge.guardian_phone ? formatPhone(charge.guardian_phone) : <span className="text-ink-3">{charge.guardian_phone_raw || 'Não informado'}</span>} />
          <Item k="E-mail" v={<span className="break-all">{charge.guardian_email || <span className="text-ink-3">Não informado</span>}</span>} />
          {charge.contact_edited && (
            <p className="text-xs text-ink-3 sm:col-span-2">Contato corrigido manualmente nesta conferência.</p>
          )}
        </dl>
      )}
    </section>
  )
}

type SaveFn = (body: Record<string, unknown>, okText: string) => Promise<boolean>

function WhatsAppPreview({ charge, compose, msgs, onSave, busy }: { charge: ChargeRow; compose: ComposeSettings; msgs: ReturnType<typeof composeMessages>; onSave: SaveFn; busy: boolean }) {
  const wa = msgs.whatsapp
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(wa.mode === 'texto' ? wa.text : '')
  const [params, setParams] = useState<string[]>(wa.mode === 'template' ? wa.params : [])

  return (
    <section>
      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            {wa.edited && <Badge tone="brand">Editada</Badge>}
            {!editing && (
              <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => {
                setText(wa.mode === 'texto' ? wa.text : '')
                setParams(wa.mode === 'template' ? wa.params : [])
                setEditing(true)
              }}>
                Editar
              </Button>
            )}
          </div>
        }
      >
        Prévia WhatsApp
      </SectionTitle>

      {wa.mode === 'template' && (
        <p className="mb-2 text-xs text-ink-3">
          Enviada pelo modelo aprovado na Meta{wa.templateName ? ` “${wa.templateName}”` : ''}. Só as partes variáveis podem ser editadas.
          {!wa.templateName && <span className="text-bad"> Nome do modelo não configurado.</span>}
        </p>
      )}

      {editing ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          {wa.mode === 'texto' ? (
            <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} aria-label="Mensagem de WhatsApp" />
          ) : (
            compose.waTemplateParams.map((name, i) => (
              <Field key={name + i} label={`{{${i + 1}}} · ${name.replace(/_/g, ' ')}`} htmlFor={`p${i}`} hint="Sem quebras de linha (exigência da Meta).">
                <Input id={`p${i}`} value={params[i] ?? ''} onChange={(e) => setParams((p) => p.map((v, k) => (k === i ? e.target.value : v)))} />
              </Field>
            ))
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={async () => {
                const ok = await onSave(wa.mode === 'texto' ? { wa_text_override: text } : { wa_params_override: params }, 'Mensagem de WhatsApp salva.')
                if (ok) setEditing(false)
              }}
            >
              Salvar mensagem
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-[#efeae2] p-3 sm:p-4">
          <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#e1f6d6] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-ink shadow-sm">
            {wa.preview}
          </div>
        </div>
      )}
      {wa.edited && !editing && (
        <button
          className="mt-2 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
          onClick={() => onSave(wa.mode === 'texto' ? { wa_text_override: null } : { wa_params_override: null }, 'Mensagem padrão restaurada.')}
        >
          <Undo2 className="size-3.5" /> Restaurar mensagem padrão
        </button>
      )}
      {charge.status === 'cancelado' && <p className="mt-2 text-xs text-ink-3">Cobrança cancelada: o envio está bloqueado.</p>}
    </section>
  )
}

function EmailPreview({ msgs, onSave, busy }: { msgs: ReturnType<typeof composeMessages>; onSave: SaveFn; busy: boolean }) {
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(msgs.email.subject)
  const [body, setBody] = useState(msgs.email.body)
  return (
    <section>
      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            {msgs.email.edited && <Badge tone="brand">Editada</Badge>}
            {!editing && (
              <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => {
                setSubject(msgs.email.subject)
                setBody(msgs.email.body)
                setEditing(true)
              }}>
                Editar
              </Button>
            )}
          </div>
        }
      >
        Prévia e-mail
      </SectionTitle>
      {editing ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <Field label="Assunto" htmlFor="em-subj">
            <Input id="em-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Mensagem" htmlFor="em-body">
            <Textarea id="em-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              onClick={async () => {
                const ok = await onSave({ email_subject_override: subject, email_body_override: body }, 'E-mail salvo.')
                if (ok) setEditing(false)
              }}
            >
              Salvar e-mail
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="h-1 bg-brand" />
          <div className="border-b border-line px-4 py-3 text-sm">
            <span className="text-ink-3">Assunto: </span>
            <span className="font-medium">{msgs.email.subject}</span>
          </div>
          <div className="px-4 py-4 text-[14px] leading-relaxed whitespace-pre-wrap">{msgs.email.body}</div>
        </div>
      )}
      {msgs.email.edited && !editing && (
        <button
          className="mt-2 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink"
          onClick={() => onSave({ email_subject_override: null, email_body_override: null }, 'E-mail padrão restaurado.')}
        >
          <RotateCcw className="size-3.5" /> Restaurar e-mail padrão
        </button>
      )}
    </section>
  )
}

function CancelButton({ onConfirm, busy }: { onConfirm: (reason: string) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!open)
    return (
      <Button size="sm" variant="ghost" icon={<Ban className="size-3.5" />} onClick={() => setOpen(true)}>
        Cancelar cobrança
      </Button>
    )
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await onConfirm(reason)) setOpen(false)
      }}
    >
      <div className="min-w-[220px] flex-1">
        <Field label="Motivo do cancelamento" htmlFor="cancel-reason">
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: pagamento confirmado na secretaria" />
        </Field>
      </div>
      <Button type="submit" size="md" variant="danger" loading={busy}>Cancelar cobrança</Button>
      <Button type="button" size="md" variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
    </form>
  )
}
