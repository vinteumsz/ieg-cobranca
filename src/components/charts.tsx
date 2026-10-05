'use client'

import { Table2 } from 'lucide-react'
import { useState } from 'react'
import { formatCents, formatCentsCompact } from '@/lib/format'
import { cx } from './ui'

export type ValueKind = 'moeda' | 'moeda-compacta' | 'numero'

function formatter(kind: ValueKind) {
  if (kind === 'moeda') return (v: number) => formatCents(v)
  if (kind === 'moeda-compacta') return (v: number) => formatCentsCompact(v)
  return (v: number) => Math.round(v).toLocaleString('pt-BR')
}

export type Datum = { label: string; value: number; hint?: string }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

function ChartFrame({
  title, subtitle, children, data, format,
}: { title: string; subtitle?: string; children: React.ReactNode; data: Datum[]; format: (v: number) => string }) {
  const [table, setTable] = useState(false)
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        <button
          onClick={() => setTable((t) => !t)}
          className={cx('flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium', table ? 'bg-ink text-white' : 'text-ink-3 hover:bg-black/5 hover:text-ink')}
          aria-pressed={table}
        >
          <Table2 className="size-3.5" /> Tabela
        </button>
      </div>
      <div className="px-5 pt-3 pb-5">
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">Sem dados para exibir.</p>
        ) : table ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {data.map((d) => (
                <tr key={d.label}>
                  <td className="py-1.5 text-ink-2">{d.label}</td>
                  <td className="py-1.5 text-right font-medium tabular">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

/** Colunas verticais (série única). */
export function ColumnChart({
  title, subtitle, data, kind, color = 'var(--color-chart-1)', height = 200,
}: { title: string; subtitle?: string; data: Datum[]; kind: ValueKind; color?: string; height?: number }) {
  const format = formatter(kind)
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const ticks = [0, 0.5, 1].map((t) => t * max)
  const top = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  return (
    <ChartFrame title={title} subtitle={subtitle} data={data} format={format}>
      <div className="flex gap-2">
        <div className="relative w-14 shrink-0 text-right text-[11px] text-ink-3 tabular" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-chart-grid" style={{ top: `${(1 - t / max) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {data.map((d, i) => {
                const h = (d.value / max) * 100
                return (
                  <div
                    key={d.label}
                    className="relative flex h-full flex-1 items-end justify-center"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${d.label}: ${format(d.value)}`}
                  >
                    {i === top && d.value > 0 && hover === null && (
                      <span className="absolute text-[11px] font-medium whitespace-nowrap text-ink-2 tabular" style={{ bottom: `calc(${h}% + 4px)` }}>
                        {format(d.value)}
                      </span>
                    )}
                    <div
                      className="w-[min(24px,70%)] rounded-t-[4px] transition-opacity"
                      style={{ height: `${h}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.45, minHeight: d.value > 0 ? 2 : 0 }}
                    />
                    {hover === i && (
                      <div className="pointer-events-none absolute z-10 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg" style={{ bottom: `calc(${h}% + 8px)` }}>
                        <p className="text-white/70">{d.hint ?? d.label}</p>
                        <p className="font-semibold tabular">{format(d.value)}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-2 flex">
            {data.map((d) => (
              <span key={d.label} className="flex-1 truncate px-0.5 text-center text-[11px] text-ink-3">
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ChartFrame>
  )
}

/** Barras horizontais ordenadas (ranking). */
export function BarList({
  title, subtitle, data, kind, color = 'var(--color-chart-2)',
}: { title: string; subtitle?: string; data: Datum[]; kind: ValueKind; color?: string }) {
  const format = formatter(kind)
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ChartFrame title={title} subtitle={subtitle} data={data} format={format}>
      <ul className="space-y-2.5">
        {data.map((d) => (
          <li key={d.label} className="group grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm" title={`${d.label}: ${format(d.value)}`}>
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-4 rounded-r-[4px] transition-opacity group-hover:opacity-80" style={{ width: `max(2px, calc((100% - 6.5rem) * ${(d.value / max).toFixed(4)}))`, background: color }} />
              <span className="shrink-0 text-xs font-medium whitespace-nowrap text-ink-2 tabular">{format(d.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}
