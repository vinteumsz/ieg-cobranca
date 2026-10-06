import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { refreshImportStats } from '@/lib/billing/recalc'
import { createAdminClient } from '@/lib/supabase/server'

// Apaga cobranças (uma ou várias) da conferência. Por padrão o histórico de envios é
// mantido; um administrador pode pedir para apagar também os envios registrados delas.
export const DELETE = route(async (req: NextRequest) => {
  const user = await apiAuth(req)
  const body = await readJson<{ ids?: unknown; envios?: unknown }>(req)
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter(isUuid))] : []
  if (ids.length === 0) throw new ApiError(400, 'Nenhuma cobrança informada.')
  if (ids.length > 3000) throw new ApiError(400, 'Selecione no máximo 3.000 cobranças por vez.')
  const withHistory = body.envios === true
  if (withHistory && user.role !== 'admin') throw new ApiError(403, 'Somente administradores podem apagar o histórico de envios.')

  const db = createAdminClient()
  const found: { id: string; import_id: string; guardian_name: string; student_name: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('charges').select('id, import_id, guardian_name, student_name').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    found.push(...(data ?? []))
  }
  if (found.length === 0) throw new ApiError(404, 'Cobranças não encontradas (talvez já tenham sido apagadas).')
  const foundIds = found.map((c) => c.id)

  let enviosApagados = 0
  for (let i = 0; i < foundIds.length; i += 200) {
    const chunk = foundIds.slice(i, i + 200)
    if (withHistory) {
      // As mensagens de cada envio são apagadas junto (on delete cascade)
      const { count, error } = await db.from('dispatches').delete({ count: 'exact' }).in('charge_id', chunk)
      if (error) throw new Error(error.message)
      enviosApagados += count ?? 0
    }
    const { error } = await db.from('charges').delete().in('id', chunk)
    if (error) throw new Error(error.message)
  }

  const importIds = [...new Set(found.map((c) => c.import_id))]
  await refreshImportStats(db, importIds)

  await audit(user, 'cobranca_excluida', {
    entity: 'charge',
    entityId: found.length === 1 ? found[0].id : undefined,
    details: {
      quantidade: found.length,
      envios_apagados: withHistory ? enviosApagados : 'mantidos',
      cobrancas: found.slice(0, 30).map((c) => `${c.guardian_name} · ${c.student_name}`),
    },
  })
  return json({ deleted: foundIds, envios: enviosApagados })
})
