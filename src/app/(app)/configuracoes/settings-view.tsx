'use client'

import { ChevronDown, Copy, FlaskConical, KeyRound, Mail, MessageCircle, MousePointerClick, Percent, Plus, ScrollText, Send, ShieldCheck, Trash2, Undo2, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import { useToast } from '@/components/toast'
import { apiFetch, Badge, Button, Card, CardHeader, cx, Field, Input, Notice, Select, Textarea } from '@/components/ui'
import { composeMessages, type ComposeSettings } from '@/lib/billing/compose'
import { dailyInterestFor, fineFor } from '@/lib/billing/interest'
import type { Installment } from '@/lib/billing/rules'
import { formatCents, monthLabel, parseMoneyToCents } from '@/lib/format'
import { INTEREST_ENABLED, OPEN_RULE_LABELS, type OpenRule, type Settings } from '@/lib/settings'

type SecretStatus = { configured: boolean; source: 'tela' | 'ambiente' | null; hint: string }
type SecretMeta = { label: string; sensitive: boolean; group: string; env: string }

type Props = {
  initial: Settings
  secretStatus: Record<string, SecretStatus>
  secretMeta: Record<string, SecretMeta>
  canEncrypt: boolean
  webhookUrl: string
  variables: { name: string; description: string }[]
  defaults: { waText: string; waTemplateBody: string; waTemplateParams: string[]; emailSubject: string; emailBody: string }
  today: string
}

const pct = (n: number | null) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
const pctNum = (v: string) => (v.trim() ? Number(v.replace(',', '.')) || null : null)

const SECTIONS = [
  ['envio', 'Forma de envio'],
  ['juros', 'Juros e multa'],
  ['regras', 'Leitura e cobrança'],
  ['mensagens', 'Mensagens e CPF'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'E-mail'],
  ['testes', 'Testes e segurança'],
] as const

export function SettingsView(props: Props) {
  const { initial, defaults } = props
  const router = useRouter()
  const toast = useToast()
  const [s, setS] = useState<Settings>(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }))
  const manual = initial.send_mode === 'manual'

  // Percentuais como texto (aceitam vírgula)
  const [daily, setDaily] = useState(pct(initial.daily_interest_pct))
  const [fine, setFine] = useState(pct(initial.fine_pct))

  // Modelos com padrão aplicado para edição
  const [waText, setWaText] = useState(initial.wa_text_template ?? defaults.waText)
  const [waBody, setWaBody] = useState(initial.wa_template_body ?? defaults.waTemplateBody)
  const [waParams, setWaParams] = useState<string[]>(initial.wa_template_params ?? defaults.waTemplateParams)
  const [emSubject, setEmSubject] = useState(initial.email_subject_template ?? defaults.emailSubject)
  const [emBody, setEmBody] = useState(initial.email_body_template ?? defaults.emailBody)

  async function save(section: string, body: Record<string, unknown>) {
    setSaving(section)
    try {
      const r = await apiFetch<{ recalculadas?: number | null }>('/api/settings', { method: 'PUT', json: body })
      toast(
        typeof r.recalculadas === 'number'
          ? `Configurações salvas. ${r.recalculadas === 1 ? '1 cobrança teve o valor recalculado' : `${r.recalculadas} cobranças tiveram o valor recalculado`}.`
          : 'Configurações salvas.',
      )
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setSaving(null)
    }
  }

  const preview = useMemo(() => {
    const inst = (venc: string, cents: number): Installment => ({
      receita: 'MENSALIDADE', parcela: '', vencimento: venc, mes: monthLabel(venc), valorParcelaCents: cents, descontoCents: 0,
      valorLiquidoCents: cents, dataPagamento: null, valorPagoCents: 0, emAbertoCents: cents, situacao: 'vencida', cobrar: true, avisos: [],
    })
    const installments = [inst('2026-04-15', 60300), inst('2026-05-15', 60300), inst('2026-06-15', 60300)]
    const cs: ComposeSettings = {
      today: props.today,
      cpf_display: s.cpf_display,
      show_updated_values: s.show_updated_values,
      email_team_name: s.email_team_name,
      daily_interest_pct: INTEREST_ENABLED ? pctNum(daily) : null,
      fine_pct: INTEREST_ENABLED ? pctNum(fine) : null,
      interest_start_date: INTEREST_ENABLED ? s.interest_start_date : null,
      wa_mode: s.send_mode === 'manual' ? 'texto' : s.wa_mode,
      wa_template_name: s.wa_template_name,
      wa_template_language: s.wa_template_language,
      waText,
      waTemplateBody: waBody,
      waTemplateParams: waParams,
      emailSubject: emSubject,
      emailBody: emBody,
    }
    return composeMessages(
      {
        guardian_name: 'Maria da Silva (exemplo)', guardian_cpf: '52998224725', student_name: 'Pedro da Silva', class_name: '6º ANO A',
        installments, total_open_cents: 180900, wa_text_override: null, wa_params_override: null, email_subject_override: null, email_body_override: null,
      },
      cs,
    )
  }, [s, daily, fine, waText, waBody, waParams, emSubject, emBody, props.today])

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="hidden lg:block" aria-label="Seções">
        <ul className="sticky top-6 space-y-0.5 text-sm">
          {SECTIONS.filter(([id]) => (!manual || (id !== 'whatsapp' && id !== 'email')) && (INTEREST_ENABLED || id !== 'juros')).map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-md px-3 py-1.5 text-ink-2 hover:bg-black/5 hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        {/* ── Forma de envio ── */}
        <Section id="envio" icon={<Send className="size-4" />} title="Forma de envio" description="Como as cobranças saem depois da conferência.">
          <div className="grid gap-3 md:grid-cols-2">
            {([
              ['manual', <MousePointerClick key="m" className="size-5" />, 'Manual (recomendado)', 'O sistema abre o WhatsApp ou o e-mail da escola com o contato e a mensagem prontos. O funcionário confere, envia e confirma para registrar no histórico. Não precisa de API, token nem servidor de e-mail.'],
              ['automatico', <Zap key="a" className="size-5" />, 'Automático pela API', 'Envia sozinho depois da confirmação, pela API oficial do WhatsApp (Meta) e por SMTP/Resend. Exige modelo aprovado na Meta e credenciais.'],
            ] as const).map(([v, icon, title, desc]) => (
              <label key={v} className={cx('flex cursor-pointer gap-3 rounded-xl border p-4', s.send_mode === v ? 'border-brand-strong bg-brand-soft' : 'border-line-strong bg-surface hover:border-ink-3')}>
                <input type="radio" name="send_mode" className="mt-1" checked={s.send_mode === v} onChange={() => set('send_mode', v)} />
                <span>
                  <span className="flex items-center gap-2 font-medium"><span className="text-brand-strong">{icon}</span>{title}</span>
                  <span className="mt-1 block text-sm text-ink-2">{desc}</span>
                </span>
              </label>
            ))}
          </div>
          <SaveRow loading={saving === 'envio'} onClick={() => save('envio', { send_mode: s.send_mode })} />
        </Section>

        {/* ── Juros e multa ── */}
        {INTEREST_ENABLED && (
          <Section
            id="juros"
            icon={<Percent className="size-4" />}
            title="Juros e multa"
            description="Como no sistema da escola: sobre o valor cheio de cada parcela vencida, contando os dias a partir do primeiro dia útil depois do vencimento (vencimento na sexta, no sábado ou no domingo começa a contar na segunda). Use 0 para não cobrar."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Multa por atraso (%)" htmlFor="fine" hint="Cobrada uma vez. Padrão da escola: 2">
                <Input id="fine" inputMode="decimal" value={fine} onChange={(e) => setFine(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Juros por dia (%)" htmlFor="daily" hint="Padrão da escola: 0,033 (1% ao mês)">
                <Input id="daily" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Começar a contar em (opcional)" htmlFor="istart" hint="Antes desta data, não há juros nem multa.">
                <Input id="istart" type="date" value={s.interest_start_date ?? ''} onChange={(e) => set('interest_start_date', e.target.value || null)} />
              </Field>
            </div>
            <InterestExample fine={pctNum(fine)} daily={pctNum(daily)} />
            <Check checked={s.show_updated_values} onChange={(v) => set('show_updated_values', v)} label="Mostrar multa, juros e valor atualizado nas mensagens" />
            <SaveRow loading={saving === 'juros'} onClick={() => save('juros', { daily_interest_pct: daily.trim() || '0', fine_pct: fine.trim() || '0', interest_start_date: s.interest_start_date, show_updated_values: s.show_updated_values })} />
          </Section>
        )}

        {/* ── Regras ── */}
        <Section id="regras" icon={<ScrollText className="size-4" />} title="Leitura e cobrança" description="Valem para as próximas importações. Ao mudar o valor cobrado, as importações já feitas também são recalculadas.">
          <Field label="Considerar parcela em aberto quando" htmlFor="rule">
            <Select id="rule" value={s.open_rule} onChange={(e) => set('open_rule', e.target.value as OpenRule)}>
              {Object.entries(OPEN_RULE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor cobrado de cada parcela" htmlFor="basis" hint="Ao salvar, as cobranças já importadas são recalculadas.">
              <Select id="basis" value={s.amount_basis} onChange={(e) => set('amount_basis', e.target.value as Settings['amount_basis'])}>
                <option value="parcela">Valor cheio da parcela (padrão da escola)</option>
                <option value="liquido">Valor líquido (com desconto)</option>
              </Select>
            </Field>
            <Field label="Tolerância após o vencimento (dias)" htmlFor="grace">
              <Input id="grace" type="number" min={0} max={60} value={s.grace_days} onChange={(e) => set('grace_days', Number(e.target.value))} />
            </Field>
          </div>
          <Check checked={s.only_overdue} onChange={(v) => set('only_overdue', v)} label="Cobrar somente parcelas já vencidas (recomendado). Parcelas a vencer aparecem na conferência, mas não entram no total." />
          <SaveRow loading={saving === 'regras'} onClick={() => save('regras', { open_rule: s.open_rule, amount_basis: s.amount_basis, grace_days: s.grace_days, only_overdue: s.only_overdue })} />
        </Section>

        {/* ── Mensagens ── */}
        <Section id="mensagens" icon={<ScrollText className="size-4" />} title="Mensagens e CPF" description="Modelos usados para montar as mensagens. Cada cobrança ainda pode ser editada individualmente na conferência.">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Exibir CPF na cobrança</legend>
            <div className="flex flex-wrap gap-2">
              {([['nao_exibir', 'Não exibir'], ['parcial', 'Exibir parcialmente (***.***.***-45)'], ['completo', 'Exibir completo']] as const).map(([v, l]) => (
                <label key={v} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', s.cpf_display === v ? 'border-brand-strong bg-brand-soft' : 'border-line-strong bg-surface')}>
                  <input type="radio" name="cpf" checked={s.cpf_display === v} onChange={() => set('cpf_display', v)} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="max-w-sm">
            <Field label="Nome da equipe (assinatura)" htmlFor="team-sig" hint="Usado em {{nome_equipe}}.">
              <Input id="team-sig" value={s.email_team_name} onChange={(e) => set('email_team_name', e.target.value)} />
            </Field>
          </div>

          <VariableChips variables={props.variables} />

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4">
              <Field label="WhatsApp" htmlFor="watext" hint="Texto aberto no WhatsApp no envio manual (e no automático em modo “texto livre”). No automático com modelo aprovado, vale o texto cadastrado na Meta.">
                <Textarea id="watext" rows={12} value={waText} onChange={(e) => setWaText(e.target.value)} />
              </Field>
              <Field label="E-mail — assunto" htmlFor="emsubj">
                <Input id="emsubj" value={emSubject} onChange={(e) => setEmSubject(e.target.value)} />
              </Field>
              <Field label="E-mail — mensagem" htmlFor="embody">
                <Textarea id="embody" rows={14} value={emBody} onChange={(e) => setEmBody(e.target.value)} />
              </Field>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Prévia com dados de exemplo</p>
              <div className="rounded-xl border border-line bg-[#efeae2] p-3">
                <div className="rounded-lg bg-[#e1f6d6] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap shadow-sm">{preview.whatsapp.preview}</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="h-1 bg-brand" />
                <p className="border-b border-line px-4 py-2 text-[13px]"><span className="text-ink-3">Assunto:</span> {preview.email.subject}</p>
                <div className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap">{preview.email.body}</div>
              </div>
            </div>
          </div>
          <SaveRow
            loading={saving === 'mensagens'}
            onClick={() => save('mensagens', { cpf_display: s.cpf_display, email_team_name: s.email_team_name, wa_text_template: waText, email_subject_template: emSubject, email_body_template: emBody })}
            extra={
              <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => {
                setWaText(defaults.waText)
                setEmSubject(defaults.emailSubject)
                setEmBody(defaults.emailBody)
              }}>
                Restaurar textos padrão
              </Button>
            }
          />
        </Section>

        <ApiSections manual={manual}>
        {/* ── WhatsApp ── */}
        <Section id="whatsapp" icon={<MessageCircle className="size-4" />} title="WhatsApp (Meta WhatsApp Cloud API)" description="Integração oficial. Não usamos WhatsApp Web nem automação de navegador.">
          <Notice tone="accent" title="Mensagens de cobrança precisam de modelo aprovado">
            A Meta só permite que a empresa inicie conversas com <strong>modelos (templates) aprovados</strong>. Cadastre o modelo no WhatsApp Manager (categoria “Utilidade”, idioma Português (BR)) e informe o nome dele aqui. Texto livre só funciona se o responsável tiver falado com a escola nas últimas 24 horas.
          </Notice>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Modo de envio" htmlFor="wamode">
              <Select id="wamode" value={s.wa_mode} onChange={(e) => set('wa_mode', e.target.value as Settings['wa_mode'])}>
                <option value="template">Modelo aprovado (recomendado)</option>
                <option value="texto">Texto livre (janela de 24h)</option>
              </Select>
            </Field>
            <Field label="Nome do modelo" htmlFor="watpl" hint="Exatamente como na Meta.">
              <Input id="watpl" value={s.wa_template_name ?? ''} onChange={(e) => set('wa_template_name', e.target.value)} placeholder="cobranca_mensalidade" />
            </Field>
            <Field label="Idioma do modelo" htmlFor="walang">
              <Input id="walang" value={s.wa_template_language} onChange={(e) => set('wa_template_language', e.target.value)} />
            </Field>
          </div>
          <Field label="Texto do modelo aprovado (para a prévia)" htmlFor="wabody" hint="Cole o corpo exatamente como aprovado, com {{1}}, {{2}}… O texto sugerido aqui pode ser usado no cadastro do modelo.">
            <Textarea id="wabody" rows={10} value={waBody} onChange={(e) => setWaBody(e.target.value)} />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">O que vai em cada variável do modelo</p>
            <ol className="space-y-2">
              {waParams.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 font-mono text-sm text-ink-3">{`{{${i + 1}}}`}</span>
                  <Select value={p} onChange={(e) => setWaParams((ps) => ps.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Variável ${i + 1}`}>
                    {props.variables.filter((v) => v.name !== 'lista_mensalidades' && v.name !== 'detalhe_atualizacao').map((v) => (
                      <option key={v.name} value={v.name}>{v.name} — {v.description}</option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setWaParams((ps) => ps.filter((_, k) => k !== i))} aria-label="Remover variável">
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ol>
            {waParams.length < 10 && (
              <Button className="mt-2" variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setWaParams((ps) => [...ps, 'valor_total'])}>
                Adicionar variável
              </Button>
            )}
          </div>
          <SaveRow
            loading={saving === 'whatsapp'}
            onClick={() => save('whatsapp', { wa_mode: s.wa_mode, wa_template_name: s.wa_template_name, wa_template_language: s.wa_template_language, wa_template_body: waBody, wa_template_params: waParams })}
          />

          <SecretsForm group="whatsapp" {...props} />

          <div className="rounded-xl border border-line bg-subtle p-4 text-sm">
            <p className="font-medium">Webhook de status de entrega</p>
            <p className="mt-1 text-ink-2">Na Meta (App → WhatsApp → Configuration), cadastre esta URL, use o “Token de verificação do webhook” acima e assine o campo <code>messages</code>:</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-3 py-2 text-xs">{props.webhookUrl}</code>
              <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => navigator.clipboard.writeText(props.webhookUrl).then(() => toast('URL copiada.'))}>
                Copiar
              </Button>
            </div>
          </div>
          <TestSend channel="whatsapp" />
        </Section>

        {/* ── E-mail ── */}
        <Section id="email" icon={<Mail className="size-4" />} title="E-mail" description="Envio por SMTP (funciona com Gmail/Google Workspace usando senha de app, Outlook, provedores de hospedagem) ou pelo serviço Resend.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Serviço de envio" htmlFor="emprov">
              <Select id="emprov" value={s.email_provider} onChange={(e) => set('email_provider', e.target.value as Settings['email_provider'])}>
                <option value="smtp">SMTP</option>
                <option value="resend">Resend (e-mail transacional)</option>
              </Select>
            </Field>
            <Field label="E-mail de resposta" htmlFor="replyto" hint="Para onde vão as respostas dos responsáveis.">
              <Input id="replyto" type="email" value={s.email_reply_to ?? ''} onChange={(e) => set('email_reply_to', e.target.value)} placeholder="financeiro@iegcolegioecurso.com.br" />
            </Field>
            <Field label="Nome do remetente" htmlFor="sender">
              <Input id="sender" value={s.email_sender_name} onChange={(e) => set('email_sender_name', e.target.value)} />
            </Field>
          </div>
          <SaveRow loading={saving === 'email'} onClick={() => save('email', { email_provider: s.email_provider, email_reply_to: s.email_reply_to, email_sender_name: s.email_sender_name })} />
          <SecretsForm group="email" {...props} provider={s.email_provider} />
          <TestSend channel="email" />
        </Section>

        </ApiSections>

        {/* ── Testes ── */}
        <Section id="testes" icon={<ShieldCheck className="size-4" />} title="Testes e segurança">
          {manual && <p className="text-sm text-ink-3">O modo de testes só vale para o envio automático. No envio manual, quem envia é sempre o funcionário.</p>}
          <div className={cx('rounded-xl border p-4', s.test_mode && !manual ? 'border-brand-line bg-brand-soft' : 'border-line bg-surface', manual && 'opacity-60')}>
            <Check
              checked={s.test_mode}
              onChange={(v) => set('test_mode', v)}
              label={
                <span>
                  <strong>Modo de testes</strong> — nenhuma mensagem chega aos responsáveis. Com contato de teste preenchido, as mensagens vão para ele; sem contato, o envio é apenas simulado.
                </span>
              }
            />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Celular de teste" htmlFor="tphone">
                <Input id="tphone" value={s.test_phone ?? ''} onChange={(e) => set('test_phone', e.target.value)} placeholder="(83) 99999-9999" />
              </Field>
              <Field label="E-mail de teste" htmlFor="temail">
                <Input id="temail" type="email" value={s.test_email ?? ''} onChange={(e) => set('test_email', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Avisar se o responsável foi cobrado nos últimos (dias)" htmlFor="window">
              <Input id="window" type="number" min={1} max={90} value={s.duplicate_window_days} onChange={(e) => set('duplicate_window_days', Number(e.target.value))} />
            </Field>
          </div>
          <Check
            checked={s.store_original_pdf}
            onChange={(v) => set('store_original_pdf', v)}
            label="Arquivar o PDF original das importações (armazenamento privado). Desligado, o PDF é lido no navegador e não é guardado — recomendado pela LGPD."
          />
          <SaveRow
            loading={saving === 'testes'}
            onClick={() => save('testes', { test_mode: s.test_mode, test_phone: s.test_phone, test_email: s.test_email, duplicate_window_days: s.duplicate_window_days, store_original_pdf: s.store_original_pdf })}
          />
        </Section>
      </div>
    </div>
  )
}

function ApiSections({ manual, children }: { manual: boolean; children: ReactNode }) {
  if (!manual) return <>{children}</>
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span>
          <span className="block text-[15px] font-semibold">Envio automático pela API (opcional)</span>
          <span className="mt-0.5 block text-sm text-ink-3">WhatsApp Cloud API e servidor de e-mail. Não são usados no envio manual.</span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-6 border-t border-line p-4">{children}</div>
    </details>
  )
}

function Section({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="scroll-mt-6">
      <div id={id} className="scroll-mt-6" />
      <CardHeader title={<span className="flex items-center gap-2"><span className="text-brand-strong">{icon}</span>{title}</span>} description={description} />
      <div className="space-y-5 px-5 py-5">{children}</div>
    </Card>
  )
}

/** Conferência rápida com um boleto: mesmo cálculo usado nas mensagens. */
function InterestExample({ fine, daily }: { fine: number | null; daily: number | null }) {
  const [value, setValue] = useState('563,00')
  const base = parseMoneyToCents(value) ?? 0
  if (!fine && !daily) return <p className="text-sm text-ink-3">Multa e juros zerados: nada é calculado e as mensagens só avisam que os valores estão sujeitos à atualização.</p>
  const f = fineFor(base, fine)
  const d = dailyInterestFor(base, daily)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-subtle px-4 py-3 text-sm text-ink-2">
      <span>Confira com um boleto: parcela de</span>
      <span className="flex items-center gap-1">
        R$
        <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="h-8 w-28 tabular" aria-label="Valor da parcela de exemplo" />
      </span>
      <span aria-live="polite">
        → multa <strong className="text-ink tabular">{formatCents(f)}</strong> · juros <strong className="text-ink tabular">{formatCents(d)}</strong> por dia · com 30 dias de atraso:{' '}
        <strong className="text-ink tabular">{formatCents(base + f + d * 30)}</strong>
      </span>
    </div>
  )
}

function SaveRow({ onClick, loading, extra }: { onClick: () => void; loading: boolean; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
      <Button variant="primary" loading={loading} onClick={onClick}>Salvar</Button>
      {extra}
    </div>
  )
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-ink-2">{label}</span>
    </label>
  )
}

function VariableChips({ variables }: { variables: { name: string; description: string }[] }) {
  const toast = useToast()
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Variáveis disponíveis <span className="font-normal text-ink-3">(clique para copiar)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <button
            key={v.name}
            type="button"
            title={v.description}
            onClick={() => navigator.clipboard.writeText(`{{${v.name}}}`).then(() => toast(`{{${v.name}}} copiado.`, 'info'))}
            className="rounded-md border border-line bg-subtle px-2 py-1 font-mono text-xs text-ink-2 hover:border-brand-strong hover:text-ink"
          >
            {`{{${v.name}}}`}
          </button>
        ))}
      </div>
    </div>
  )
}

function SecretsForm({ group, secretStatus, secretMeta, canEncrypt, provider }: Props & { group: 'whatsapp' | 'email'; provider?: string }) {
  const toast = useToast()
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState(secretStatus)
  const [busy, setBusy] = useState(false)
  const keys = Object.keys(secretMeta).filter((k) => {
    if (secretMeta[k].group !== group) return false
    if (group === 'email' && provider === 'resend' && k.startsWith('smtp_')) return false
    if (group === 'email' && provider === 'smtp' && k === 'resend_api_key') return false
    return true
  })

  async function submit(body: Record<string, string | null>) {
    setBusy(true)
    try {
      const r = await apiFetch<{ status: Record<string, SecretStatus> }>('/api/integrations', { method: 'PUT', json: body })
      setStatus(r.status)
      setValues({})
      toast('Credenciais salvas no servidor.')
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()))

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 text-ink-3" /> Credenciais (ficam somente no servidor, criptografadas)
      </p>
      {!canEncrypt && (
        <div className="mb-3">
          <Notice tone="warn" title="Chave de criptografia ausente">
            Defina <code>APP_ENCRYPTION_KEY</code> no servidor para salvar credenciais por esta tela. Enquanto isso, elas podem ser definidas como variáveis de ambiente.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {keys.map((k) => {
          const st = status[k]
          return (
            <Field
              key={k}
              label={secretMeta[k].label}
              htmlFor={`sec-${k}`}
              hint={
                st?.configured ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="ok">configurado</Badge>
                    <span className="font-mono">{st.hint}</span>
                    {st.source === 'ambiente' ? (
                      <span>· variável {secretMeta[k].env}</span>
                    ) : (
                      <button type="button" className="text-bad underline underline-offset-2" onClick={() => submit({ [k]: null })}>
                        remover
                      </button>
                    )}
                  </span>
                ) : (
                  'Não configurado'
                )
              }
            >
              <Input
                id={`sec-${k}`}
                type={secretMeta[k].sensitive ? 'password' : 'text'}
                autoComplete="off"
                value={values[k] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                placeholder={st?.configured ? 'Digite para substituir' : ''}
              />
            </Field>
          )
        })}
      </div>
      <div className="mt-4">
        <Button variant="primary" loading={busy} disabled={Object.keys(filled).length === 0} onClick={() => submit(filled)}>
          Salvar credenciais
        </Button>
      </div>
    </div>
  )
}

function TestSend({ channel }: { channel: 'whatsapp' | 'email' }) {
  const toast = useToast()
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line-strong p-4">
      <div className="min-w-[220px] flex-1">
        <Field label={channel === 'whatsapp' ? 'Enviar WhatsApp de teste para' : 'Enviar e-mail de teste para'} htmlFor={`test-${channel}`} hint="Use seu próprio contato. Nenhum dado de responsável é usado.">
          <Input id={`test-${channel}`} value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === 'whatsapp' ? '(83) 99999-9999' : 'voce@iegcolegioecurso.com.br'} />
        </Field>
      </div>
      <Button
        variant="secondary"
        icon={channel === 'whatsapp' ? <FlaskConical className="size-4" /> : <Send className="size-4" />}
        loading={busy}
        disabled={!to.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            await apiFetch('/api/integrations/test', { method: 'POST', json: { channel, to } })
            toast('Mensagem de teste enviada.')
          } catch (e) {
            toast((e as Error).message, 'bad')
          } finally {
            setBusy(false)
          }
        }}
      >
        Enviar teste
      </Button>
    </div>
  )
}
