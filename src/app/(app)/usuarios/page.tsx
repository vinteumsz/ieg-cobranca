import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import { UsersView } from './users-view'

export const metadata: Metadata = { title: 'Usuários' }

export default async function UsersPage() {
  const me = await requireAdmin()
  const { data } = await createAdminClient().from('profiles').select('id, email, full_name, role, active, created_at').order('full_name')
  return (
    <>
      <PageHeader
        title="Usuários"
        description="Funcionários com acesso ao sistema. Operadores importam, conferem e enviam; administradores também alteram configurações, integrações e usuários."
      />
      <UsersView users={(data ?? []) as Profile[]} meId={me.id} />
    </>
  )
}
