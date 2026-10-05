import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { env } from '../env'

/** Cliente com a sessão do funcionário (respeita o RLS: somente leitura). */
export async function createUserClient() {
  const cookieStore = await cookies()
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  })
}

let admin: SupabaseClient | null = null

/**
 * Cliente com a chave secreta. Usar SOMENTE no servidor e SEMPRE depois de
 * checar o usuário com requireUser()/requireAdmin().
 */
export function createAdminClient() {
  if (!admin) {
    admin = createSupabaseClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return admin
}
