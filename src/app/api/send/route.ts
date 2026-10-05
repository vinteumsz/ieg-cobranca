import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, isUuid, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { sendCharges, type Channel } from '@/lib/send/service'

export const runtime = 'nodejs'
export const maxDuration = 120

type Body = { batchId: string; chargeIds: string[]; channels: Channel[]; allowResend?: string[]; confirmed?: boolean }

// Envia um LOTE PEQUENO (até 10 cobranças). A tela chama várias vezes e mostra o progresso.
// Só é chamado depois da janela de confirmação (confirmed: true).
export const POST = route(async (req: NextRequest) => {
  const user = await apiAuth(req)
  const body = await readJson<Body>(req)
  if (body.confirmed !== true) throw new ApiError(400, 'O envio precisa ser confirmado.')
  if (!isUuid(body.batchId)) throw new ApiError(400, 'Lote inválido.')
  if (!Array.isArray(body.chargeIds) || body.chargeIds.length === 0 || body.chargeIds.length > 10 || !body.chargeIds.every(isUuid)) {
    throw new ApiError(400, 'Envie de 1 a 10 cobranças por vez.')
  }
  const channels = [...new Set(body.channels)].filter((c): c is Channel => c === 'whatsapp' || c === 'email')
  if (channels.length === 0) throw new ApiError(400, 'Escolha pelo menos um canal.')
  const allowResend = (body.allowResend ?? []).filter(isUuid)

  const results = await sendCharges({ user, batchId: body.batchId, chargeIds: body.chargeIds, channels, allowResend })

  const count = (st: string) => results.reduce((n, r) => n + (r.whatsapp?.status === st ? 1 : 0) + (r.email?.status === st ? 1 : 0), 0)
  await audit(user, 'envio_realizado', {
    entity: 'batch',
    entityId: body.batchId,
    details: {
      canais: channels,
      cobrancas: body.chargeIds.length,
      enviadas: count('enviado'),
      simuladas: count('simulado'),
      erros: count('erro'),
      ignoradas: results.filter((r) => r.skipped).length,
    },
  })
  return json({ results })
})
