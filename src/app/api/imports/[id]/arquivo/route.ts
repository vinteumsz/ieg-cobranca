import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { loadSettings } from '@/lib/data'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }
const BUCKET = 'relatorios'
const pathFor = (id: string) => `${id}/relatorio.pdf`

async function getImport(id: string) {
  if (!isUuid(id)) throw new ApiError(400, 'Importação inválida.')
  const { data } = await createAdminClient().from('imports').select('id, file_name, storage_path').eq('id', id).maybeSingle()
  if (!data) throw new ApiError(404, 'Importação não encontrada.')
  return data
}

// 1) Gera um endereço temporário para o navegador enviar o PDF direto ao armazenamento privado.
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req)
  const { id } = await params
  const settings = await loadSettings()
  if (!settings.store_original_pdf) throw new ApiError(403, 'O arquivamento do PDF está desativado pela administração.')
  await getImport(id)
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(pathFor(id))
  if (error || !data) throw new Error(error?.message ?? 'Falha ao preparar o envio')
  void user
  return json({ uploadUrl: data.signedUrl, apikey: env.supabasePublishableKey })
})

// 2) Confirma que o arquivo chegou e registra na importação.
export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req)
  const { id } = await params
  await getImport(id)
  const { data } = await createAdminClient().storage.from(BUCKET).list(id)
  if (!data?.some((f) => f.name === 'relatorio.pdf')) throw new ApiError(409, 'O arquivo não foi encontrado no armazenamento.')
  await createAdminClient().from('imports').update({ storage_path: pathFor(id) }).eq('id', id)
  void user
  return json({ ok: true })
})

// Baixar o PDF arquivado (somente administradores)
export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req, { admin: true })
  const { id } = await params
  const imp = await getImport(id)
  if (!imp.storage_path) throw new ApiError(404, 'Esta importação não tem PDF arquivado.')
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(imp.storage_path, 60, { download: imp.file_name })
  if (error || !data) throw new ApiError(404, 'Arquivo não encontrado.')
  await audit(user, 'pdf_baixado', { entity: 'import', entityId: id, details: { arquivo: imp.file_name } })
  return NextResponse.redirect(data.signedUrl, { status: 303 })
})

// Excluir só o PDF (mantém a conferência)
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req)
  const { id } = await params
  const imp = await getImport(id)
  if (imp.storage_path) await createAdminClient().storage.from(BUCKET).remove([imp.storage_path])
  await createAdminClient().from('imports').update({ storage_path: null }).eq('id', id)
  await audit(user, 'pdf_excluido', { entity: 'import', entityId: id, details: { arquivo: imp.file_name } })
  return json({ ok: true })
})
