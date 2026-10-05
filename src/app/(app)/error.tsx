'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <AlertTriangle className="mx-auto size-10 text-bad" />
      <h1 className="mt-4 text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-ink-2">
        Não foi possível carregar esta página. Tente novamente; se continuar, informe o código abaixo ao responsável técnico.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-3">{error.digest}</p>}
      <Button className="mt-6" variant="primary" onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
