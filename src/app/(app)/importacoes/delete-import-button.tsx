'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/toast'
import { apiFetch, Button, Modal } from '@/components/ui'

export function DeleteImportButton({ id, fileName, charges, hasPdf }: { id: string; fileName: string; charges: number; hasPdf: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      await apiFetch(`/api/imports/${id}`, { method: 'DELETE' })
      toast('Importação excluída.')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad"
        aria-label={`Excluir importação ${fileName}`}
        title="Excluir importação"
      >
        <Trash2 className="size-4" />
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Excluir importação?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Voltar</Button>
            <Button variant="danger" loading={busy} onClick={remove}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <strong className="text-ink">{fileName}</strong>: as {charges} cobranças desta importação{hasPdf ? ' e o PDF arquivado' : ''} serão apagadas. O histórico de mensagens já enviadas é mantido (pode ser apagado em Histórico).
        </p>
      </Modal>
    </>
  )
}
