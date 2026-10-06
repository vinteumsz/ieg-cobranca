import 'server-only'
import { headers } from 'next/headers'
import { createAdminClient } from './supabase/server'

export type AuditAction =
  | 'login' | 'login_falhou' | 'logout'
  | 'importacao_criada' | 'importacao_excluida' | 'importacao_visualizada' | 'pdf_baixado' | 'pdf_excluido'
  | 'cobranca_editada' | 'cobranca_conferida' | 'cobranca_cancelada' | 'cobranca_reaberta' | 'cobranca_excluida'
  | 'envio_realizado' | 'envio_teste' | 'envio_excluido'
  | 'valores_recalculados'
  | 'configuracoes_alteradas' | 'integracao_alterada'
  | 'usuario_criado' | 'usuario_alterado'
  | 'historico_exportado'

export async function audit(
  user: { id: string; email: string } | null,
  action: AuditAction,
  opts: { entity?: string; entityId?: string; details?: Record<string, unknown>; email?: string } = {},
) {
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '').split(',')[0].trim() || null
    await createAdminClient()
      .from('audit_logs')
      .insert({
        user_id: user?.id ?? null,
        user_email: user?.email ?? opts.email ?? null,
        action,
        entity: opts.entity ?? null,
        entity_id: opts.entityId ?? null,
        details: opts.details ?? {},
        ip,
        user_agent: h.get('user-agent')?.slice(0, 300) ?? null,
      })
  } catch (e) {
    console.error('[auditoria] falha ao registrar', action, e)
  }
}
