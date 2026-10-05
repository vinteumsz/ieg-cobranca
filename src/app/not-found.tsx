import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-6xl font-semibold text-brand">404</p>
        <h1 className="mt-3 text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-ink-3">O endereço pode ter mudado ou a importação foi excluída.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white">
          Voltar ao painel
        </Link>
      </div>
    </main>
  )
}
