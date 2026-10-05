import { NextResponse, type NextRequest } from 'next/server'
import { audit } from '@/lib/audit'
import { createUserClient } from '@/lib/supabase/server'

async function signOut(req: NextRequest) {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await audit({ id: user.id, email: user.email ?? '' }, 'logout')
  await supabase.auth.signOut()
  const motivo = req.nextUrl.searchParams.get('motivo') ?? 'saiu'
  return NextResponse.redirect(new URL(`/login?motivo=${encodeURIComponent(motivo)}`, req.url), { status: 303 })
}

export async function POST(req: NextRequest) {
  return signOut(req)
}

// Usado em redirecionamentos internos (acesso desativado)
export async function GET(req: NextRequest) {
  return signOut(req)
}
