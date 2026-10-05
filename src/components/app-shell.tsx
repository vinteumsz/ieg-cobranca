'use client'

import { FileUp, Files, FlaskConical, History, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Logo } from './logo'
import { cx } from './ui'

type NavItem = { href: string; label: string; icon: ReactNode; admin?: boolean }

const NAV: NavItem[] = [
  { href: '/', label: 'Painel', icon: <LayoutDashboard className="size-[18px]" /> },
  { href: '/importar', label: 'Importar relatório', icon: <FileUp className="size-[18px]" /> },
  { href: '/importacoes', label: 'Importações', icon: <Files className="size-[18px]" /> },
  { href: '/historico', label: 'Histórico', icon: <History className="size-[18px]" /> },
  { href: '/configuracoes', label: 'Configurações', icon: <Settings className="size-[18px]" />, admin: true },
  { href: '/usuarios', label: 'Usuários', icon: <Users className="size-[18px]" />, admin: true },
  { href: '/logs', label: 'Logs de acesso', icon: <ShieldCheck className="size-[18px]" />, admin: true },
]

export function AppShell({
  user, testMode, children,
}: { user: { name: string; role: 'admin' | 'operador' }; testMode: boolean; children: ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])

  const items = NAV.filter((n) => !n.admin || user.role === 'admin')
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'))

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Menu principal">
      {items.map((item, i) => (
        <div key={item.href}>
          {item.admin && !items[i - 1]?.admin && (
            <p className="mt-5 mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Administração</p>
          )}
          <Link
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className={cx(
              'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive(item.href) ? 'bg-brand-soft text-ink' : 'text-ink-2 hover:bg-black/[0.04] hover:text-ink',
            )}
          >
            {isActive(item.href) && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" aria-hidden />}
            <span className={isActive(item.href) ? 'text-brand-strong' : 'text-ink-3'}>{item.icon}</span>
            {item.label}
          </Link>
        </div>
      ))}
    </nav>
  )

  const footer = (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-xs text-ink-3">{user.role === 'admin' ? 'Administrador' : 'Operador'}</p>
        </div>
        <form action="/auth/sair" method="post">
          <button className="rounded-md p-2 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Sair" title="Sair">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Barra lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        {nav}
        {footer}
      </aside>

      {/* Barra superior (celular) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-black/5" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Logo />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-black/5" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      )}

      {testMode && (
        <div className="border-b border-brand-line bg-brand-soft px-4 py-2 text-center text-[13px] text-ink sm:px-8">
          <FlaskConical className="mr-1.5 inline size-4 -translate-y-px text-brand-strong" />
          <strong>Modo de testes ativo:</strong> nenhuma mensagem chega aos responsáveis.{' '}
          {user.role === 'admin' ? (
            <Link href="/configuracoes#testes" className="font-medium text-brand-hover underline underline-offset-2">
              Ajustar
            </Link>
          ) : (
            'Fale com um administrador para desativar.'
          )}
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8 lg:px-6 2xl:px-8">{children}</main>
    </div>
  )
}
