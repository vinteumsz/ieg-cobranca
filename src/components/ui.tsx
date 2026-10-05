'use client'

import { Loader2, X } from 'lucide-react'
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function cx(...c: unknown[]) {
  return c.filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ')
}

// ─── Botões ────────────────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const styles = {
    primary: 'bg-ink text-white hover:bg-black disabled:bg-ink/40',
    brand: 'bg-brand-strong text-white hover:bg-brand-hover disabled:bg-brand-strong/40',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle hover:border-ink-3 disabled:text-ink-3',
    ghost: 'text-ink-2 hover:bg-black/5 hover:text-ink disabled:text-ink-3',
    danger: 'bg-bad text-white hover:bg-[#8f1c13] disabled:bg-bad/40',
  }[variant]
  const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' }[size]
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        styles,
        sizes,
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

// ─── Cartões e cabeçalhos ──────────────────────────────────────────────────

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-xl border border-line bg-surface', className)}>{children}</section>
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ─── Selos ─────────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'brand' | 'accent' | 'ok' | 'warn' | 'bad'

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-black/[0.05] text-ink-2',
    brand: 'bg-brand-soft text-brand-hover',
    accent: 'bg-accent-soft text-accent-strong',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function Notice({ tone = 'neutral', title, children, icon }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: 'border-line bg-subtle text-ink-2',
    brand: 'border-brand-line bg-brand-soft text-ink',
    accent: 'border-accent/25 bg-accent-soft text-ink',
    ok: 'border-ok/25 bg-ok-soft text-ink',
    warn: 'border-warn/25 bg-warn-soft text-ink',
    bad: 'border-bad/25 bg-bad-soft text-ink',
  }
  return (
    <div className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm', tones[tone])} role={tone === 'bad' ? 'alert' : undefined}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'text-ink-2')}>{children}</div>}
      </div>
    </div>
  )
}

// ─── Formulários ───────────────────────────────────────────────────────────

const fieldBase =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-subtle disabled:text-ink-3'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-10', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, 'py-2.5 leading-relaxed', className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Field({ label, hint, htmlFor, children, error }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  )
}

// ─── Diálogos ──────────────────────────────────────────────────────────────

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const handler = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d.addEventListener('cancel', handler)
    return () => d.removeEventListener('cancel', handler)
  }, [onClose])
  return ref
}

export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useDialog(open, onClose)
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size]
  return (
    <dialog
      ref={ref}
      className={cx('modal-panel m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl', w)}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="-m-1 rounded-md p-1 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Fechar">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-subtle px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      className="drawer-panel m-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl border-l border-line bg-canvas p-0 text-ink shadow-2xl"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{title}</h2>
              {subtitle && <div className="mt-0.5 text-sm text-ink-3">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="-m-1 rounded-md p-1 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Fechar">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="border-t border-line bg-surface px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

// ─── Diversos ──────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 rounded-2xl bg-brand-soft p-3 text-brand-strong">{icon}</div>}
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-3">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export async function apiFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    window.location.href = '/login?motivo=sessao'
    throw new Error('Sessão expirada.')
  }
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `Erro ${res.status}`) as Error & { data?: unknown; status?: number }
    err.data = data
    err.status = res.status
    throw err
  }
  return data as T
}
