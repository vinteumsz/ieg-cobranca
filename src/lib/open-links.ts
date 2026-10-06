// Links para abrir o WhatsApp ou o e-mail com o contato e a mensagem já preenchidos.
// Quem envia é o funcionário, no próprio WhatsApp/e-mail da escola — sem API e sem automação.

export type WaTarget = 'web' | 'app'
export type MailClient = 'padrao' | 'gmail' | 'outlook'
export type OpenPrefs = { wa: WaTarget; mail: MailClient }

export const DEFAULT_PREFS: OpenPrefs = { wa: 'web', mail: 'padrao' }

const enc = encodeURIComponent

export function isMobileDevice(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

/** phone: só dígitos com DDI (ex.: 5583999990000) */
export function whatsappUrl(phone: string, text: string, target: WaTarget, mobile: boolean): string {
  const p = phone.replace(/\D/g, '')
  if (mobile) return `https://wa.me/${p}?text=${enc(text)}`
  if (target === 'app') return `whatsapp://send?phone=${p}&text=${enc(text)}`
  return `https://web.whatsapp.com/send?phone=${p}&text=${enc(text)}`
}

export function emailUrl(to: string, subject: string, body: string, client: MailClient): string {
  if (client === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`
  if (client === 'outlook') return `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`
  return `mailto:${to.trim()}?subject=${enc(subject)}&body=${enc(body.replace(/\r?\n/g, '\r\n'))}`
}

/** Abre o link: protocolos (whatsapp:, mailto:) na própria aba; sites numa aba reaproveitada. */
export function openLink(url: string, windowName: string) {
  if (/^(whatsapp|mailto):/i.test(url)) {
    window.location.href = url
    return
  }
  const w = window.open(url, windowName)
  w?.focus()
}

const KEY = 'ieg-cobranca:abertura'

export function loadPrefs(): OpenPrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const v = JSON.parse(raw) as Partial<OpenPrefs>
    return {
      wa: v.wa === 'app' ? 'app' : 'web',
      mail: v.mail === 'gmail' || v.mail === 'outlook' ? v.mail : 'padrao',
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: OpenPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* navegador sem armazenamento: segue com o padrão */
  }
}
