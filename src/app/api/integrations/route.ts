import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { canEncrypt } from '@/lib/crypto'
import { getSecretStatus, SECRET_KEYS, setSecret, type SecretKey } from '@/lib/secrets'

// Segredos: o navegador só ENVIA valores novos; nunca recebe os valores salvos.
export const GET = route(async (req: NextRequest) => {
  await apiAuth(req, { admin: true })
  return json({ status: await getSecretStatus(), canEncrypt: canEncrypt() })
})

export const PUT = route(async (req: NextRequest) => {
  const user = await apiAuth(req, { admin: true })
  const body = await readJson<Partial<Record<SecretKey, string | null>>>(req)
  const entries = Object.entries(body).filter(([k, v]) => SECRET_KEYS.includes(k as SecretKey) && (typeof v === 'string' || v === null)) as [SecretKey, string | null][]
  if (entries.length === 0) throw new ApiError(400, 'Nada para salvar.')
  if (!canEncrypt() && entries.some(([, v]) => v)) {
    throw new ApiError(500, 'Defina a variável APP_ENCRYPTION_KEY no servidor antes de salvar credenciais pela tela.')
  }
  for (const [k, v] of entries) {
    const value = (v ?? '').trim()
    if (value.length > 4000) throw new ApiError(422, 'Valor longo demais.')
    if (k === 'smtp_port' && value && !/^\d{2,5}$/.test(value)) throw new ApiError(422, 'Porta SMTP inválida.')
    await setSecret(k, value, user.id)
  }
  await audit(user, 'integracao_alterada', { entity: 'integration', details: { campos: entries.map(([k, v]) => `${k}${v ? '' : ' (removido)'}`) } })
  return json({ status: await getSecretStatus() })
})
