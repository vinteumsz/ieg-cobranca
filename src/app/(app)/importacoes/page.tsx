import type { Metadata } from 'next'
import { ChevronRight, FileText, FileUp, Files } from 'lucide-react'
import Link from 'next/link'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { formatCents, formatDateTime } from '@/lib/format'
import { createUserClient } from '@/lib/supabase/server'
import type { ImportRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Importações' }

export default async function ImportsPage() {
  await requireUser()
  const db = await createUserClient()
  const { data } = await db.from('imports').select('*').order('created_at', { ascending: false }).limit(100)
  const rows = (data ?? []) as ImportRow[]

  return (
    <>
      <PageHeader
        title="Importações"
        description="Relatórios já processados. Abra uma importação para conferir e enviar as cobranças, ou exclua as que não serão mais usadas."
        actions={
          <Link href="/importar" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-strong px-4 text-sm font-semibold text-white hover:bg-brand-hover">
            <FileUp className="size-4" /> Importar relatório
          </Link>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Files className="size-6" />} title="Nenhum relatório importado ainda">
            Comece importando o PDF do relatório financeiro.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const when = formatDateTime(r.created_at)
              return (
                <li key={r.id}>
                  <Link href={`/importacoes/${r.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-subtle">
                    <div className="hidden rounded-lg bg-brand-soft p-2.5 text-brand-strong sm:block">
                      <FileText className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.file_name}</p>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {when.date} às {when.time}
                        {r.imported_by_name ? ` · ${r.imported_by_name}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge>{r.stats?.cobrancas ?? 0} cobranças</Badge>
                        {(r.stats?.comAlertaCritico ?? 0) > 0 && <Badge tone="bad">{r.stats.comAlertaCritico} com alerta</Badge>}
                        {r.extraction_method === 'ocr' && <Badge tone="brand">OCR</Badge>}
                        {r.storage_path && <Badge tone="accent">PDF arquivado</Badge>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-semibold">{formatCents(r.stats?.totalCents ?? 0)}</p>
                      <p className="text-xs text-ink-3">em aberto</p>
                    </div>
                    <ChevronRight className="size-4 text-ink-3" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
