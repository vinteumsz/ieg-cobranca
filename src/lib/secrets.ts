import 'server-only'
import { decryptSecret, encryptSecret } from './crypto'
import { createAdminClient } from './supabase/server'

export const SECRET_META = {
  wa_phone_number_id: { label: 'Phone Number ID', env: 'WHATSAPP_PHONE_NUMBER_ID', sensitive: false, group: 'whatsapp' },
  wa_business_account_id: { label: 'WhatsApp Business Account ID', env: 'WHATSAPP_BUSINESS_ACCOUNT_ID', sensitive: false, group: 'whatsapp' },
  wa_access_token: { label: 'Token de acesso (API Key)', env: 'WHATSAPP_ACCESS_TOKEN', sensitive: true, group: 'whatsapp' },
  wa_app_secret: { label: 'App Secret (validação do webhook)', env: 'WHATSAPP_APP_SECRET', sensitive: true, group: 'whatsapp' },
  wa_verify_token: { label: 'Token de verificação do webhook', env: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', sensitive: true, group: 'whatsapp' },
  email_from_address: { label: 'E-mail remetente', env: 'EMAIL_FROM_ADDRESS', sensitive: false, group: 'email' },
  smtp_host: { label: 'Servidor SMTP', env: 'SMTP_HOST', sensitive: false, group: 'email' },
  smtp_port: { label: 'Porta SMTP', env: 'SMTP_PORT', sensitive: false, group: 'email' },
  smtp_user: { label: 'Usuário SMTP', env: 'SMTP_USER', sensitive: false, group: 'email' },
  smtp_password: { label: 'Senha SMTP / senha de app', env: 'SMTP_PASSWORD', sensitive: true, group: 'email' },
  resend_api_key: { label: 'Chave da API Resend', env: 'RESEND_API_KEY', sensitive: true, group: 'email' },
} as const

export type SecretKey = keyof typeof SECRET_META
export const SECRET_KEYS = Object.keys(SECRET_META) as SecretKey[]

export type SecretStatus = { configured: boolean; source: 'tela' | 'ambiente' | null; hint: string }

function hintFor(key: SecretKey, value: string): string {
  if (!value) return ''
  if (!SECRET_META[key].sensitive) return value
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`
}

async function readStored(): Promise<Map<string, { value_encrypted: string; hint: string | null }>> {
  const { data, error } = await createAdminClient().from('integration_secrets').select('key, value_encrypted, hint')
  if (error) throw new Error('Falha ao ler as integrações: ' + error.message)
  return new Map((data ?? []).map((r) => [r.key as string, r as { value_encrypted: string; hint: string | null }]))
}

/** Valores reais — uso exclusivo do servidor (envio de mensagens). */
export async function getSecrets(): Promise<Record<SecretKey, string>> {
  const stored = await readStored()
  const out = {} as Record<SecretKey, string>
  for (const k of SECRET_KEYS) {
    const row = stored.get(k)
    let value = ''
    if (row) {
      try {
        value = decryptSecret(row.value_encrypted)
      } catch (e) {
        console.error(`[segredos] não foi possível descriptografar ${k}`, e)
      }
    }
    out[k] = value || process.env[SECRET_META[k].env] || ''
  }
  return out
}

/** Somente o que pode aparecer na tela: configurado? de onde? final do valor. */
export async function getSecretStatus(): Promise<Record<SecretKey, SecretStatus>> {
  const stored = await readStored()
  const out = {} as Record<SecretKey, SecretStatus>
  for (const k of SECRET_KEYS) {
    const row = stored.get(k)
    const envValue = process.env[SECRET_META[k].env] || ''
    if (row) out[k] = { configured: true, source: 'tela', hint: row.hint ?? '' }
    else if (envValue) out[k] = { configured: true, source: 'ambiente', hint: hintFor(k, envValue) }
    else out[k] = { configured: false, source: null, hint: '' }
  }
  return out
}

export async function setSecret(key: SecretKey, value: string, userId: string) {
  const db = createAdminClient()
  const v = value.trim()
  if (!v) {
    const { error } = await db.from('integration_secrets').delete().eq('key', key)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await db.from('integration_secrets').upsert({
    key,
    value_encrypted: encryptSecret(v),
    hint: hintFor(key, v),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  })
  if (error) throw new Error(error.message)
}
