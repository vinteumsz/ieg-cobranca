import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

type Msg = { charge_id: string; channel: 'whatsapp' | 'email'; status: string; sent_at: string | null; created_at: string }

const SENT = ['enviado', 'entregue', 'lido']

/**
 * Depois de apagar envios do histórico, devolve cada cobrança ao estado que corresponde
 * aos envios que restaram (sem nenhum envio: volta para "pendente").
 * Cobranças canceladas continuam canceladas.
 */
export async function resyncChargeStatus(db: SupabaseClient, chargeIds: string[]) {
  const ids = [...new Set(chargeIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const [{ data: charges, error: cErr }, { data: msgs, error: mErr }] = await Promise.all([
      db.from('charges').select('id, status').in('id', chunk),
      db
        .from('messages')
        .select('charge_id, channel, status, sent_at, created_at')
        .in('charge_id', chunk)
        .not('status', 'in', '(pendente,cancelado)')
        .order('created_at', { ascending: false }),
    ])
    if (cErr) throw new Error(cErr.message)
    if (mErr) throw new Error(mErr.message)

    await Promise.all(
      ((charges ?? []) as { id: string; status: string }[]).map(async (c) => {
        const mine = ((msgs ?? []) as Msg[]).filter((m) => m.charge_id === c.id)
        const wa = mine.find((m) => m.channel === 'whatsapp')
        const em = mine.find((m) => m.channel === 'email')
        const sent = mine.filter((m) => SENT.includes(m.status))
        const lastSent = sent.map((m) => m.sent_at ?? m.created_at).sort().at(-1) ?? null
        const status =
          c.status === 'cancelado'
            ? 'cancelado'
            : sent.some((m) => m.status !== 'enviado')
              ? 'entregue'
              : sent.length
                ? 'enviado'
                : wa?.status === 'erro' || em?.status === 'erro'
                  ? 'erro'
                  : 'pendente'
        const { error } = await db
          .from('charges')
          .update({
            status,
            wa_status: wa?.status ?? null,
            email_status: em ? (em.status === 'lido' ? 'entregue' : em.status) : null,
            last_sent_at: lastSent,
          })
          .eq('id', c.id)
        if (error) throw new Error(error.message)
      }),
    )
  }
}
