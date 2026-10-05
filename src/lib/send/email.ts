import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailProvider } from '../settings'
import type { SendResult } from './whatsapp'

export type EmailConfig = {
  provider: EmailProvider
  fromAddress: string
  fromName: string
  replyTo: string | null
  smtp: { host: string; port: number; user: string; pass: string }
  resendKey: string
}

export function emailConfigProblem(cfg: EmailConfig): string | null {
  if (!cfg.fromAddress) return 'Informe o e-mail remetente em Configurações → E-mail.'
  if (cfg.provider === 'smtp' && (!cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass)) return 'SMTP incompleto: informe servidor, usuário e senha.'
  if (cfg.provider === 'resend' && !cfg.resendKey) return 'Informe a chave da API Resend.'
  return null
}

let cached: { key: string; t: Transporter } | null = null

function smtpTransport(cfg: EmailConfig): Transporter {
  const key = `${cfg.smtp.host}|${cfg.smtp.port}|${cfg.smtp.user}|${cfg.smtp.pass.length}`
  if (cached?.key === key) return cached.t
  const t = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.port === 465,
    requireTLS: cfg.smtp.port !== 465,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  })
  cached = { key, t }
  return t
}

const sanitizeHeader = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

export async function sendEmail(cfg: EmailConfig, to: string, subject: string, text: string, html: string): Promise<SendResult> {
  const problem = emailConfigProblem(cfg)
  if (problem) return { ok: false, error: problem }
  const from = `"${sanitizeHeader(cfg.fromName).replace(/"/g, '')}" <${cfg.fromAddress}>`
  const subj = sanitizeHeader(subject)
  try {
    if (cfg.provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject: subj, text, html, ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}) }),
        signal: AbortSignal.timeout(20_000),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      if (res.ok && data.id) return { ok: true, id: data.id }
      return { ok: false, error: `Resend recusou: ${data.message ?? `HTTP ${res.status}`}` }
    }
    const info = await smtpTransport(cfg).sendMail({ from, to, subject: subj, text, html, replyTo: cfg.replyTo ?? undefined })
    if (info.rejected?.length) return { ok: false, error: `Endereço recusado pelo servidor: ${info.rejected.join(', ')}` }
    return { ok: true, id: info.messageId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/auth|535|534/i.test(msg)) return { ok: false, error: 'Falha de autenticação no SMTP (usuário/senha ou senha de app).' }
    return { ok: false, error: `Falha no envio do e-mail: ${msg.slice(0, 200)}` }
  }
}
