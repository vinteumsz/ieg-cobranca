import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

// Exclui a importação e as cobranças dela. O histórico de envios é mantido
// (com nome, aluno, valor e quem enviou), como registro de auditoria.
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const user = await apiAuth(req)
  const { id } = await params
  if (!isUuid(id)) throw new ApiError(400, 'Importação inválida.')
  const db = createAdminClient()
  const { data: imp } = await db.from('imports').select('id, file_name, storage_path').eq('id', id).maybeSingle()
  if (!imp) throw new ApiError(404, 'Importação não encontrada.')

  if (imp.storage_path) await db.storage.from('relatorios').remove([imp.storage_path])
  const { error } = await db.from('imports').delete().eq('id', id)
  if (error) throw new Error(error.message)

  await audit(user, 'importacao_excluida', { entity: 'import', entityId: id, details: { arquivo: imp.file_name } })
  return json({ ok: true })
})
