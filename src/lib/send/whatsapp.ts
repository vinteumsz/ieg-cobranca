import 'server-only'

// Envio pela API oficial (Meta WhatsApp Cloud API). Nada de WhatsApp Web ou automação de navegador.

export type WaConfig = { phoneNumberId: string; token: string; graphVersion: string }

export type WaPayload =
  | { mode: 'template'; templateName: string; language: string; params: string[] }
  | { mode: 'texto'; text: string }

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

const KNOWN_ERRORS: Record<number, string> = {
  190: 'Token do WhatsApp inválido ou expirado. Atualize em Configurações → WhatsApp.',
  10: 'O token não tem permissão para enviar mensagens por este número.',
  100: 'Parâmetro inválido na requisição (confira o Phone Number ID e o modelo).',
  131026: 'Mensagem não entregue: o número pode não ter WhatsApp.',
  131030: 'Número não autorizado: em contas de teste da Meta, só é possível enviar para números cadastrados.',
  131047: 'Fora da janela de 24 horas: use o modo "Modelo aprovado" para iniciar a conversa.',
  131049: 'A Meta não entregou a mensagem para preservar a qualidade do ecossistema (limite de mensagens por usuário).',
  131051: 'Tipo de mensagem não suportado.',
  131056: 'Muitas mensagens para o mesmo número em pouco tempo. Tente mais tarde.',
  130429: 'Limite de envios da API atingido. Aguarde e tente novamente.',
  132000: 'A quantidade de variáveis não confere com o modelo aprovado na Meta.',
  132001: 'Modelo não encontrado na Meta (confira o nome e o idioma).',
  132005: 'O texto das variáveis ficou longo demais para o modelo.',
  132007: 'O conteúdo das variáveis viola a política do modelo.',
  132015: 'O modelo está pausado pela Meta por baixa qualidade.',
  132016: 'O modelo foi desativado pela Meta.',
  133010: 'Número do remetente não registrado na Cloud API.',
}

export async function sendWhatsApp(cfg: WaConfig, to: string, payload: WaPayload): Promise<SendResult> {
  const body =
    payload.mode === 'template'
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: payload.templateName,
            language: { code: payload.language },
            components: payload.params.length
              ? [{ type: 'body', parameters: payload.params.map((text) => ({ type: 'text', text })) }]
              : [],
          },
        }
      : { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: payload.text } }

  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string; code?: number; error_data?: { details?: string } }
    }
    if (res.ok && data.messages?.[0]?.id) return { ok: true, id: data.messages[0].id }
    const code = data.error?.code
    const known = code !== undefined ? KNOWN_ERRORS[code] : undefined
    const detail = data.error?.error_data?.details ?? data.error?.message ?? `HTTP ${res.status}`
    return { ok: false, error: known ? `${known} (código ${code})` : `WhatsApp recusou: ${detail}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'TimeoutError' ? 'Tempo esgotado ao falar com a Meta.' : 'Falha de conexão com a Meta.' }
  }
}

/** Mensagens de status vindas do webhook → status interno. */
export function mapWaStatus(s: string): 'enviado' | 'entregue' | 'lido' | 'erro' | null {
  if (s === 'sent') return 'enviado'
  if (s === 'delivered') return 'entregue'
  if (s === 'read') return 'lido'
  if (s === 'failed') return 'erro'
  return null
}

export function waErrorFromWebhook(errors: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] | undefined): string {
  const e = errors?.[0]
  if (!e) return 'Falha na entrega informada pela Meta.'
  const known = e.code !== undefined ? KNOWN_ERRORS[e.code] : undefined
  return known ?? e.error_data?.details ?? e.message ?? e.title ?? 'Falha na entrega informada pela Meta.'
}
