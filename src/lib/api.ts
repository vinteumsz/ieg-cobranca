import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser, type SessionUser } from './auth'

export class ApiError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Envolve um route handler com tratamento de erros padronizado. */
export function route<C>(handler: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await handler(req, ctx)
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, ...(e.extra ?? {}) }, e.status)
      console.error('[api]', req.method, req.nextUrl.pathname, e)
      return json({ error: 'Erro interno. Tente novamente ou fale com o administrador.' }, 500)
    }
  }
}

/** Bloqueia requisições de outros sites (CSRF) em métodos que alteram dados. */
function checkOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
  const origin = req.headers.get('origin')
  if (!origin) throw new ApiError(403, 'Origem da requisição ausente.')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    /* inválida */
  }
  if (!host || originHost !== host) throw new ApiError(403, 'Origem da requisição não permitida.')
}

export async function apiAuth(req: NextRequest, opts: { admin?: boolean } = {}): Promise<SessionUser> {
  checkOrigin(req)
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, 'Sessão expirada ou acesso desativado. Entre novamente.')
  if (opts.admin && user.role !== 'admin') throw new ApiError(403, 'Somente administradores podem fazer isso.')
  return user
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError(400, 'Requisição inválida.')
  }
}

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
