import { AppShell } from '@/components/app-shell'
import { displayUser, requireUser } from '@/lib/auth'
import { loadSettings } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const settings = await loadSettings()
  return (
    <AppShell user={{ name: displayUser(user), role: user.role }} testMode={settings.test_mode}>
      {children}
    </AppShell>
  )
}
