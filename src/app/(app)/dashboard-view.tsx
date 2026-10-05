import { ArrowRight, FileUp, LayoutDashboard, Mail, MessageCircle, Send } from 'lucide-react'
import Link from 'next/link'
import { BarList, ColumnChart, type Datum } from '@/components/charts'
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui'
import { computeDebtUpdate, isInterestConfigured, type InterestSettings } from '@/lib/billing/interest'
import { daysBetween, formatCents, formatDateTime, monthShortLabel, nameKey } from '@/lib/format'
import type { ChargeRow, ImportRow } from '@/lib/types'

const AGING = [
  { label: 'Até 30 dias', max: 30 },
  { label: '31 a 60', max: 60 },
  { label: '61 a 90', max: 90 },
  { label: '91 a 180', max: 180 },
  { label: 'Mais de 180', max: Infinity },
]

export function buildDashboard(charges: Pick<ChargeRow, 'guardian_cpf' | 'guardian_name' | 'student_name' | 'class_name' | 'installments' | 'open_count' | 'total_open_cents'>[], settings: InterestSettings, today: string) {
  const totalOpen = charges.reduce((s, c) => s + c.total_open_cents, 0)
  const guardians = new Set(charges.map((c) => c.guardian_cpf || nameKey(c.guardian_name))).size
  const students = new Set(charges.map((c) => nameKey(c.student_name))).size
  const overdue = charges.reduce((s, c) => s + c.open_count, 0)
  const interest = isInterestConfigured(settings)
  const updated = interest ? charges.reduce((s, c) => s + computeDebtUpdate(c.installments, settings, today).updatedCents, 0) : 0

  // Gráficos
  const byMonth = new Map<string, number>()
  const aging = AGING.map((a) => ({ label: a.label, value: 0 }))
  const byClass = new Map<string, number>()
  for (const c of charges) {
    for (const i of c.installments.filter((x) => x.cobrar)) {
      const m = i.vencimento.slice(0, 7)
      byMonth.set(m, (byMonth.get(m) ?? 0) + i.emAbertoCents)
      const days = daysBetween(i.vencimento, today)
      const idx = AGING.findIndex((a) => days <= a.max)
      aging[Math.max(0, idx)].value++
    }
    const turma = c.class_name?.trim() || 'Sem turma'
    byClass.set(turma, (byClass.get(turma) ?? 0) + c.total_open_cents)
  }
  const monthData: Datum[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({ label: monthShortLabel(m), value: v }))
  const classesSorted = [...byClass.entries()].sort((a, b) => b[1] - a[1])
  const classData: Datum[] = classesSorted.slice(0, 12).map(([label, value]) => ({ label, value }))
  if (classesSorted.length > 12) classData.push({ label: 'Outras turmas', value: classesSorted.slice(12).reduce((s, [, v]) => s + v, 0) })

  return { totalOpen, guardians, students, overdue, interest, updated, monthData, aging, classData, classCount: byClass.size }
}

export type DashboardData = ReturnType<typeof buildDashboard>

export function DashboardView({
  firstName, imp, aviso, data, sentToday, wa30, email30,
}: { firstName: string; imp: Pick<ImportRow, 'id' | 'file_name' | 'created_at'> | null; aviso?: string; data: DashboardData; sentToday: number; wa30: number; email30: number }) {
  const { totalOpen, guardians, students, overdue, interest, updated, monthData, aging, classData } = data
  const importedAt = imp ? formatDateTime(imp.created_at) : null
  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        description={
          imp ? (
            <>
              Números do último relatório importado ({imp.file_name}, em {importedAt!.date}).{' '}
              <Link href={`/importacoes/${imp.id}`} className="font-medium text-brand-hover underline underline-offset-2">
                Abrir conferência
              </Link>
            </>
          ) : (
            'Importe o relatório financeiro para começar.'
          )
        }
        actions={
          <Link href="/importar" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-brand-hover">
            <FileUp className="size-4" /> Importar relatório
          </Link>
        }
      />

      {aviso === 'somente-admin' && (
        <div className="mb-5">
          <Notice tone="warn">Essa área é exclusiva de administradores.</Notice>
        </div>
      )}

      {!imp ? (
        <Card>
          <EmptyState
            icon={<LayoutDashboard className="size-6" />}
            title="Ainda não há dados"
            action={
              <Link href="/importar" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-brand-hover">
                Importar o primeiro relatório <ArrowRight className="size-4" />
              </Link>
            }
          >
            O painel mostra o total em aberto, os inadimplentes e os envios assim que o primeiro relatório for importado.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-line bg-surface p-6">
              <p className="text-sm text-ink-3">Total em aberto (parcelas vencidas)</p>
              <p className="mt-1 font-display text-[40px] leading-tight font-semibold tracking-tight whitespace-nowrap sm:text-5xl">{formatCents(totalOpen)}</p>
              {interest ? (
                <p className="mt-2 text-sm text-ink-2">
                  Com multa e juros até hoje: <strong className="text-ink">{formatCents(updated)}</strong>
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-3">Sem taxas de juros configuradas — valores sujeitos à atualização.</p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
              <Tile label="Responsáveis inadimplentes" value={guardians} />
              <Tile label="Alunos" value={students} />
              <Tile label="Mensalidades vencidas" value={overdue} />
              <Tile label="Mensagens enviadas hoje" value={sentToday} icon={<Send className="size-4" />} />
            </dl>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ChannelTile icon={<MessageCircle className="size-5" />} label="Cobranças por WhatsApp" value={wa30} tone="brand" />
            <ChannelTile icon={<Mail className="size-5" />} label="Cobranças por e-mail" value={email30} tone="accent" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ColumnChart title="Inadimplência por mês" subtitle="Valor em aberto por mês de vencimento" data={monthData} kind="moeda-compacta" />
            <ColumnChart
              title="Parcelas vencidas"
              subtitle="Quantidade por tempo de atraso"
              data={aging}
              kind="numero"
              color="var(--color-chart-2)"
            />
          </div>
          <BarList title="Valor em aberto por turma" subtitle={`${data.classCount} turma(s) com pendência`} data={classData} kind="moeda" color="var(--color-chart-1)" />
        </div>
      )}
    </>
  )
}

function Tile({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="flex items-center gap-1.5 text-xs text-ink-3">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-display text-2xl font-semibold">{value.toLocaleString('pt-BR')}</dd>
    </div>
  )
}

function ChannelTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'brand' | 'accent' }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4">
      <span className={tone === 'brand' ? 'rounded-lg bg-brand-soft p-2.5 text-brand-strong' : 'rounded-lg bg-accent-soft p-2.5 text-accent-strong'}>{icon}</span>
      <div>
        <p className="text-sm text-ink-3">{label}</p>
        <p className="font-display text-2xl font-semibold">
          {value.toLocaleString('pt-BR')} <span className="text-sm font-normal text-ink-3">nos últimos 30 dias</span>
        </p>
      </div>
    </div>
  )
}
