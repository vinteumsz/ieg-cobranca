import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui'
import { loadSettings } from '@/lib/data'
import { OPEN_RULE_LABELS } from '@/lib/settings'
import { UploadForm } from './upload-form'

export const metadata: Metadata = { title: 'Importar relatório' }

export default async function ImportPage() {
  const s = await loadSettings()
  return (
    <>
      <PageHeader
        title="Importar relatório de cobrança"
        description="Envie o PDF do relatório financeiro. O sistema lê os responsáveis, alunos e parcelas e prepara a conferência. Nenhuma mensagem é enviada nesta etapa."
      />
      <UploadForm
        storePdf={s.store_original_pdf}
        rules={{
          openRule: OPEN_RULE_LABELS[s.open_rule],
          onlyOverdue: s.only_overdue,
          graceDays: s.grace_days,
          basis: s.amount_basis === 'liquido' ? 'Valor líquido (com desconto)' : 'Valor da parcela (sem desconto)',
        }}
      />
    </>
  )
}
