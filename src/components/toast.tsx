'use client'

import { CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastTone = 'ok' | 'bad' | 'info'
type ToastItem = { id: number; tone: ToastTone; text: string }

const Ctx = createContext<(text: string, tone?: ToastTone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, tone, text }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'bad' ? 7000 : 4000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl"
            role={t.tone === 'bad' ? 'alert' : 'status'}
          >
            {t.tone === 'ok' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#6ee7a0]" />}
            {t.tone === 'bad' && <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#ff9b8f]" />}
            {t.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-[#8fd6ec]" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
