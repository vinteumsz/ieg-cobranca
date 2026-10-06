import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { resyncChargeStatus } from '@/lib/send/resync'
import { createAdminClient } from '@/lib/supabase/server'

// Apaga registros do histórico de envios (e as mensagens de cada um). Se a cobrança
// ainda existir na conferência, o status dela é refeito com os envios que restaram —
// por exemplo, um "registrar envio" feito por engano volta a cobrança para pendente.
export const DELETE = route(async (req: NextRequest) => {
  const user = await apiAuth(req, { admin: true })
  const body = await readJson<{ ids?: unknown }>(req)
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter(isUuid))] : []
  if (ids.length === 0) throw new ApiError(400, 'Nenhum envio informado.')
  if (ids.length > 1000) throw new ApiError(400, 'Selecione no máximo 1.000 envios por vez.')

  const db = createAdminClient()
  const found: { id: string; charge_id: string | null; guardian_name: string; student_name: string; status: string; created_at: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('dispatches').select('id, charge_id, guardian_name, student_name, status, created_at').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    found.push(...(data ?? []))
  }
  if (found.length === 0) throw new ApiError(404, 'Envios não encontrados (talvez já tenham sido apagados).')

  for (let i = 0; i < found.length; i += 200) {
    const { error } = await db.from('dispatches').delete().in('id', found.slice(i, i + 200).map((d) => d.id))
    if (error) throw new Error(error.message)
  }

  await resyncChargeStatus(db, found.map((d) => d.charge_id).filter((x): x is string => !!x))

  await audit(user, 'envio_excluido', {
    entity: 'dispatch',
    entityId: found.length === 1 ? found[0].id : undefined,
    details: {
      quantidade: found.length,
      envios: found.slice(0, 30).map((d) => `${d.guardian_name} · ${d.student_name} (${d.status}, ${d.created_at.slice(0, 10)})`),
    },
  })
  return json({ deleted: found.map((d) => d.id) })
})
