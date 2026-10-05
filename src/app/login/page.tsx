import type { Metadata } from 'next'
import { Lock, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/logo'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Entrar' }

const REASONS: Record<string, string> = {
  sessao: 'Sua sessão expirou. Entre novamente.',
  acesso: 'Seu acesso não está ativo. Fale com a administração.',
  saiu: 'Você saiu do sistema.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ voltar?: string; motivo?: string }> }) {
  const { voltar, motivo } = await searchParams
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand/90" aria-hidden />
        <div className="absolute -right-20 -bottom-40 size-80 rounded-full border-[28px] border-accent/70" aria-hidden />
        <div className="relative">
          <span className="inline-grid size-11 place-items-center rounded-full bg-brand font-display text-sm font-bold">IEG</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-semibold leading-tight">Cobrança com conferência, do relatório ao envio.</p>
          <p className="mt-4 text-white/70">
            Importe o relatório financeiro, revise cada responsável e só então envie por WhatsApp ou e-mail. Nada sai sem a sua confirmação.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-white/60">
          <ShieldCheck className="size-4" /> Uso interno da equipe financeira · IEG Colégio e Curso
        </p>
      </aside>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-ink-2">Acesso restrito a funcionários autorizados.</p>
          {motivo && REASONS[motivo] && (
            <p className="mt-5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2">{REASONS[motivo]}</p>
          )}
          <LoginForm voltar={voltar ?? '/'} />
          <p className="mt-8 flex items-center gap-2 text-xs text-ink-3">
            <Lock className="size-3.5" /> Os acessos são registrados. Esqueceu a senha? Peça a um administrador.
          </p>
        </div>
      </section>
    </main>
  )
}
