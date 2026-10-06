// Utilitários de formatação e validação (sem dependências; rodam no servidor e no navegador).

export const SCHOOL_NAME = 'IEG Colégio e Curso'
export const TIMEZONE = 'America/Fortaleza'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ─── Texto ─────────────────────────────────────────────────────────────────

/** Remove acentos e passa para maiúsculas, preservando o tamanho da string (1 caractere → 1 caractere). */
export function normalizeKeepLength(s: string): string {
  let out = ''
  for (const ch of s) {
    let n = ch.normalize('NFD')[0] ?? ch
    n = n.toUpperCase()
    out += n.length === 1 ? n : ch
  }
  return out
}

/** Chave estável para comparar nomes: sem acentos, maiúsculas, espaços simples. */
export function nameKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const LOWER_PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del'])

/** "MARIA DA SILVA" → "Maria da Silva". Nomes já com maiúsculas/minúsculas são mantidos. */
export function displayName(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const hasLower = /[a-zà-ÿ]/.test(clean)
  const hasUpper = /[A-ZÀ-Þ]/.test(clean)
  if (hasLower && hasUpper) {
    // Mantém a grafia original, só corrige partículas ("Pedro Da Silva" → "Pedro da Silva")
    return clean
      .split(' ')
      .map((w, i) => (i > 0 && LOWER_PARTICLES.has(w.toLocaleLowerCase('pt-BR')) ? w.toLocaleLowerCase('pt-BR') : w))
      .join(' ')
  }
  return clean
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((w, i) => (i > 0 && LOWER_PARTICLES.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)))
    .join(' ')
}

export function firstName(s: string): string {
  return displayName(s).split(' ')[0] ?? ''
}

// ─── Dinheiro (sempre em centavos inteiros) ────────────────────────────────

export const MONEY_RE = /(?<![\d,./])-?\d{1,3}(?:\.\d{3})*,\d{2}(?![\d/])|(?<![\d,./])-?\d+,\d{2}(?![\d/])/g

/** Valor digitado pelo funcionário ("1.250,00", "R$ 0,19", "300") → centavos. */
export function reaisToCents(v: string): number | null {
  let t = v.replace(/R\$|\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export function parseMoneyToCents(raw: string): number | null {
  const m = raw.replace(/R\$\s*/gi, '').trim().match(/^(-)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/)
  if (!m) return null
  const reais = parseInt(m[2].replace(/\./g, ''), 10)
  const cents = reais * 100 + parseInt(m[3], 10)
  return m[1] ? -cents : cents
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 162900 → "R$ 1.629,00" (com espaço comum, seguro para WhatsApp e e-mail). */
export function formatCents(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, ' ')
}

export function formatCentsCompact(cents: number): string {
  const v = cents / 100
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (Math.abs(v) >= 10_000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return formatCents(cents)
}

// ─── Datas (ISO yyyy-mm-dd, sem fuso) ──────────────────────────────────────

export const DATE_RE = /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g

export function parseDateBR(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/)
  if (!m) return null
  const d = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  let y = parseInt(m[3], 10)
  if (m[3].length === 2) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** 2026-04-15 → "Abril/2026" */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTHS[parseInt(m, 10) - 1]}/${y}`
}

export function monthShortLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split('-')
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

/** Data de hoje (yyyy-mm-dd) no fuso de João Pessoa/Fortaleza. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10))
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Data e hora no fuso local, para telas e histórico. */
export function formatDateTime(ts: string | Date | null | undefined): { date: string; time: string } {
  if (!ts) return { date: '—', time: '' }
  const d = typeof ts === 'string' ? new Date(ts) : ts
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(d)
  return { date, time }
}

/** Início do dia de hoje (fuso local) em ISO UTC — para consultas "enviadas hoje". */
export function startOfTodayUTC(now: Date = new Date()): string {
  const today = todayISO(now)
  // Fortaleza é UTC-3 o ano inteiro (sem horário de verão)
  return new Date(`${today}T00:00:00-03:00`).toISOString()
}

// ─── CPF ───────────────────────────────────────────────────────────────────

export const CPF_RE = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/

export function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}

export function isValidCpf(raw: string | null | undefined): boolean {
  const cpf = onlyDigits(raw)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += parseInt(cpf[i], 10) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === parseInt(cpf[9], 10) && calc(10) === parseInt(cpf[10], 10)
}

export function formatCpf(raw: string | null | undefined): string {
  const c = onlyDigits(raw)
  if (c.length !== 11) return raw ?? ''
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
}

/** Exibição parcial: ***.***.***-45 */
export function maskCpf(raw: string | null | undefined): string {
  const c = onlyDigits(raw)
  if (c.length !== 11) return ''
  return `***.***.***-${c.slice(9)}`
}

export type CpfDisplay = 'nao_exibir' | 'parcial' | 'completo'

export function cpfForMessage(raw: string | null | undefined, mode: CpfDisplay): string {
  if (mode === 'nao_exibir' || !raw || onlyDigits(raw).length !== 11) return ''
  return mode === 'completo' ? formatCpf(raw) : maskCpf(raw)
}

// ─── Telefone (Brasil) ─────────────────────────────────────────────────────

export type PhoneInfo = {
  /** Somente dígitos com DDI 55, pronto para a API do WhatsApp. Vazio se inválido. */
  e164: string
  display: string
  kind: 'celular' | 'fixo' | 'invalido' | 'ausente'
  /** O número de 8 dígitos recebeu o 9 na frente */
  ninthDigitAdded?: boolean
}

function phoneFromDigits(digits: string): PhoneInfo {
  let n = digits.replace(/^0+/, '')
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) n = n.slice(2)
  if (n.length === 11 && n[2] === '9') {
    return { e164: `55${n}`, display: `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`, kind: 'celular' }
  }
  if (n.length === 10) {
    const first = n[2]
    if ('6789'.includes(first)) {
      const m = `${n.slice(0, 2)}9${n.slice(2)}`
      return { e164: `55${m}`, display: `(${m.slice(0, 2)}) ${m.slice(2, 7)}-${m.slice(7)}`, kind: 'celular', ninthDigitAdded: true }
    }
    if ('2345'.includes(first)) {
      return { e164: '', display: `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`, kind: 'fixo' }
    }
  }
  return { e164: '', display: digits, kind: 'invalido' }
}

/** Interpreta o campo de telefone do relatório (pode ter mais de um número). Prefere celular. */
export function parseBrPhone(raw: string | null | undefined): PhoneInfo {
  const text = (raw ?? '').trim()
  if (!text) return { e164: '', display: '', kind: 'ausente' }
  const candidates = text.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\s*\d{4}[\s.-]?\d{4}/g) ?? []
  const parsed = candidates.map((c) => phoneFromDigits(onlyDigits(c)))
  if (parsed.length === 0) {
    const d = onlyDigits(text)
    return d ? phoneFromDigits(d) : { e164: '', display: text, kind: 'invalido' }
  }
  return parsed.find((p) => p.kind === 'celular') ?? parsed[0]
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const n = e164.startsWith('55') ? e164.slice(2) : e164
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return e164
}

// ─── E-mail ────────────────────────────────────────────────────────────────

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

export function isValidEmail(s: string | null | undefined): boolean {
  return !!s && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s.trim())
}

/** Primeiro e-mail válido de um campo que pode ter vários. */
export function pickEmail(raw: string | null | undefined): string {
  const m = (raw ?? '').match(new RegExp(EMAIL_RE.source, 'g')) ?? []
  const found = m.map((e) => e.toLowerCase().replace(/\.+$/, '')).find(isValidEmail)
  return found ?? ''
}
