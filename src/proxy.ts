import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Renova a sessão do Supabase a cada requisição e manda quem não está logado para /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [h, v] of Object.entries(headers ?? {})) response.headers.set(h, v)
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = path === '/login' || path.startsWith('/api/webhooks/')

  if (!user && !isPublic) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
    }
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.search = path !== '/' ? `?voltar=${encodeURIComponent(path)}` : ''
    return NextResponse.redirect(login)
  }
  if (user && path === '/login') {
    const home = request.nextUrl.clone()
    home.pathname = '/'
    home.search = ''
    return NextResponse.redirect(home)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg|.*\\.(?:png|jpg|jpeg|svg|webp|woff2?)$).*)'],
}
