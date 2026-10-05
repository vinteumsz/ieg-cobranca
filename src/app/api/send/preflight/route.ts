import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { preflight } from '@/lib/send/service'

export const runtime = 'nodejs'

export const POST = route(async (req: NextRequest) => {
  await apiAuth(req)
  const { chargeIds } = await readJson<{ chargeIds: string[] }>(req)
  if (!Array.isArray(chargeIds) || chargeIds.length === 0 || chargeIds.length > 2000 || !chargeIds.every(isUuid)) {
    throw new ApiError(400, 'Seleção inválida.')
  }
  return json(await preflight(chargeIds))
})
