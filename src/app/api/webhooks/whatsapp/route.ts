import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getSecrets } from '@/lib/secrets'
import { mapWaStatus, waErrorFromWebhook } from '@/lib/send/whatsapp'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// Configure na Meta (App → WhatsApp → Configuration → Webhook):
//   URL: https://SEU-DOMINIO/api/webhooks/whatsapp   ·   campo assinado: "messages"
// O token de verificação e o App Secret ficam em Configurações → WhatsApp.

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const { wa_verify_token } = await getSecrets()
  if (p.get('hub.mode') === 'subscribe' && wa_verify_token && p.get('hub.verify_token') === wa_verify_token) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

type StatusEvent = { id: string; status: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }

const RANK: Record<string, number> = { pendente: 0, enviado: 1, entregue: 2, lido: 3 }

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const { wa_app_secret } = await getSecrets()
  if (!wa_app_secret) return new NextResponse('Webhook não configurado', { status: 503 })

  const sig = req.headers.get('x-hub-signature-256') ?? ''
  const expected = 'sha256=' + createHmac('sha256', wa_app_secret).update(raw).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse('Assinatura inválida', { status: 401 })

  let payload: { entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[] }
  try {
    payload = JSON.parse(raw)
  } catch {
    return new NextResponse('JSON inválido', { status: 400 })
  }

  const db = createAdminClient()
  const statuses = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []))

  for (const ev of statuses) {
    const next = mapWaStatus(ev.status)
    if (!next) continue
    const { data: msg } = await db
      .from('messages')
      .select('id, status, charge_id, dispatch_id')
      .eq('provider_message_id', ev.id)
      .maybeSingle()
    if (!msg || msg.status === 'simulado') continue
    // Não "volta" status (ex.: delivered chegando depois de read)
    if (next !== 'erro' && (RANK[msg.status] ?? 0) >= RANK[next]) continue

    const when = ev.timestamp ? new Date(Number(ev.timestamp) * 1000).toISOString() : new Date().toISOString()
    const upd: Record<string, unknown> = { status: next }
    if (next === 'entregue') upd.delivered_at = when
    if (next === 'lido') upd.read_at = when
    if (next === 'erro') upd.error_message = waErrorFromWebhook(ev.errors)
    await db.from('messages').update(upd).eq('id', msg.id)

    if (msg.dispatch_id) {
      if (next === 'entregue' || next === 'lido') await db.from('dispatches').update({ status: 'entregue' }).eq('id', msg.dispatch_id).in('status', ['enviado', 'pendente'])
      if (next === 'erro') {
        const { data: siblings } = await db.from('messages').select('status').eq('dispatch_id', msg.dispatch_id)
        if ((siblings ?? []).every((m) => m.status === 'erro')) await db.from('dispatches').update({ status: 'erro' }).eq('id', msg.dispatch_id)
      }
    }
    if (msg.charge_id) {
      const chargeUpd: Record<string, unknown> = { wa_status: next }
      if (next === 'entregue' || next === 'lido') chargeUpd.status = 'entregue'
      await db.from('charges').update(chargeUpd).eq('id', msg.charge_id).neq('status', 'cancelado')
    }
  }
  return NextResponse.json({ ok: true })
}
