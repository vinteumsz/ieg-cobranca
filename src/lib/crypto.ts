import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './env'

function key(): Buffer {
  const raw = env.encryptionKey
  const k = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0)
  if (k.length !== 32) {
    throw new Error(
      'APP_ENCRYPTION_KEY ausente ou inválida (precisa ter 32 bytes em base64). ' +
        'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  return k
}

export function canEncrypt(): boolean {
  try {
    key()
    return true
  } catch {
    return false
  }
}

/** AES-256-GCM → "v1:<base64(iv | tag | dados)>" */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith('v1:')) throw new Error('Formato de segredo desconhecido')
  const buf = Buffer.from(payload.slice(3), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}
