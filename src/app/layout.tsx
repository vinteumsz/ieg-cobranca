import '@fontsource-variable/inter'
import '@fontsource-variable/sora'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/toast'

export const metadata: Metadata = {
  title: { default: 'IEG Cobrança', template: '%s · IEG Cobrança' },
  description: 'Sistema interno da equipe financeira do IEG Colégio e Curso',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#FF6B00',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
