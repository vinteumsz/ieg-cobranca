// Leitura do relatório financeiro (lista de alunos/responsáveis com tabela de parcelas).
//
// O parser trabalha sobre LINHAS com posições horizontais (vindas do texto do PDF
// ou do OCR) e é tolerante a variações de layout:
//  • rótulos com ou sem dois-pontos ("ALUNO: Fulano", "ALUNO  Fulano")
//  • vários rótulos na mesma linha ("CPF: ...   E-MAIL: ...   CELULAR: ...")
//  • rótulos numa linha e valores na linha de baixo (layout em colunas)
//  • células vazias na tabela (ex.: desconto em branco) — resolvidas pela posição
//    da coluna no cabeçalho ou pela coerência dos valores
// Tudo que parece estranho vira um AVISO para a equipe conferir.

import { CPF_RE, DATE_RE, EMAIL_RE, MONEY_RE, normalizeKeepLength, parseDateBR, parseMoneyToCents } from '../format'
import { lineText } from './lines'
import type { Cell, Line, ParseResult, RawInstallment, RawRecord } from './types'

type FieldKey =
  | 'aluno' | 'responsavel' | 'cpf' | 'cpf_aluno' | 'email' | 'celular' | 'endereco' | 'bairro'
  | 'cidade' | 'cep' | 'uf' | 'turma' | 'matricula' | 'nascimento' | 'rg'

const LABELS: { key: FieldKey; re: RegExp; needsColon?: boolean }[] = [
  { key: 'responsavel', re: /NOME DO RESPONSAVEL(?: FINANCEIRO)?|RESPONSAVEL FINANCEIRO|RESP\.? FINANCEIRO|RESPONSAVEL\s*\(A\)|RESPONSAVEL/y },
  { key: 'aluno', re: /NOME DO ALUNO\s*\(A\)|NOME DO ALUNO|ALUNO\s*\(A\)|ALUNO|ESTUDANTE/y },
  { key: 'cpf_aluno', re: /CPF DO ALUNO\s*\(A\)|CPF DO ALUNO/y },
  { key: 'cpf', re: /CPF\s*\/\s*CNPJ|CPF DO RESPONSAVEL(?: FINANCEIRO)?|CPF/y },
  { key: 'email', re: /E-?\s?MAILS?|CORREIO ELETRONICO/y },
  { key: 'celular', re: /CELULAR\s*\/\s*WHATSAPP|CELULAR|WHATSAPP|TELEFONES?|FONES?|CEL\./y },
  { key: 'endereco', re: /ENDERECO/y },
  { key: 'bairro', re: /BAIRRO/y },
  { key: 'cidade', re: /CIDADE|MUNICIPIO/y },
  { key: 'cep', re: /CEP/y },
  { key: 'uf', re: /UF/y, needsColon: true },
  { key: 'rg', re: /RG/y, needsColon: true },
  { key: 'turma', re: /SERIE\s*\/\s*TURMA|TURMA|SERIE/y },
  { key: 'matricula', re: /MATRICULA|MAT\./y },
  { key: 'nascimento', re: /DATA DE NASCIMENTO|NASCIMENTO|DT\.? NASC\.?/y },
]

type Hit = { key: FieldKey; labelStart: number; valueStart: number }

/** Encontra rótulos numa célula (texto já normalizado). */
function findLabels(norm: string): Hit[] {
  const hits: Hit[] = []
  let i = 0
  while (i < norm.length) {
    const atBoundary = i === 0 || /[\s|;,(]/.test(norm[i - 1])
    if (atBoundary) {
      let best: { key: FieldKey; len: number; needsColon: boolean } | null = null
      for (const l of LABELS) {
        l.re.lastIndex = i
        const m = l.re.exec(norm)
        if (m && (!best || m[0].length > best.len)) best = { key: l.key, len: m[0].length, needsColon: !!l.needsColon }
      }
      if (best) {
        const end = i + best.len
        const next = norm[end] ?? ''
        if (!/[A-Z0-9]/.test(next)) {
          let j = end
          while (norm[j] === ' ') j++
          const hasColon = norm[j] === ':'
          const atCellStart = norm.slice(0, i).trim() === ''
          if (hasColon || (atCellStart && !best.needsColon)) {
            hits.push({ key: best.key, labelStart: i, valueStart: hasColon ? j + 1 : end })
            i = hasColon ? j + 1 : end
            continue
          }
        }
      }
    }
    i++
  }
  return hits
}

type Seg = { key: FieldKey | null; value: string; x0: number }

function xAt(cell: Cell, idx: number): number {
  const len = Math.max(1, cell.text.length)
  return cell.x0 + ((cell.x1 - cell.x0) * idx) / len
}

/** Divide a linha em pares rótulo → valor. */
function segmentLine(line: Line): Seg[] {
  const segs: Seg[] = []
  let cur: Seg = { key: null, value: '', x0: line.cells[0]?.x0 ?? 0 }
  for (const cell of line.cells) {
    const norm = normalizeKeepLength(cell.text)
    const hits = findLabels(norm)
    if (hits.length === 0) {
      cur.value += ' ' + cell.text
      continue
    }
    if (hits[0].labelStart > 0) cur.value += ' ' + cell.text.slice(0, hits[0].labelStart)
    hits.forEach((h, idx) => {
      segs.push(cur)
      const end = idx + 1 < hits.length ? hits[idx + 1].labelStart : cell.text.length
      cur = { key: h.key, value: cell.text.slice(h.valueStart, end), x0: xAt(cell, h.labelStart) }
    })
  }
  segs.push(cur)
  return segs
    .map((s) => ({ ...s, value: s.value.replace(/\s+/g, ' ').replace(/^[\s:–-]+/, '').trim() }))
    .filter((s) => s.key !== null || s.value.length > 0)
}

// ─── Tabela de parcelas ────────────────────────────────────────────────────

type ColKey = 'receita' | 'parcela' | 'vencimento' | 'valorParcela' | 'desconto' | 'valorLiquido' | 'dataPagamento' | 'valorPago'
type Anchors = Partial<Record<ColKey, number>>

const COLS: [ColKey, RegExp][] = [
  ['valorParcela', /VALOR DA PARCELA|VALOR PARCELA|VLR\.? ?PARCELA|VL\.? ?PARCELA|VALOR ORIGINAL|VALOR BRUTO/g],
  ['valorLiquido', /VALOR LIQUIDO|VLR\.? ?LIQUIDO|VL\.? ?LIQUIDO|V\. ?LIQUIDO|LIQUIDO/g],
  ['valorPago', /VALOR PAGO|VLR\.? ?PAGO|VL\.? ?PAGO|V\. ?PAGO/g],
  ['dataPagamento', /DATA DE PAGAMENTO|DATA DO PAGAMENTO|DATA PAGAMENTO|DATA PGTO|DT\.? ?PAG(?:AMENTO|TO)?\.?|PAGO EM|PAGAMENTO/g],
  ['desconto', /DESCONTOS?|DESC\./g],
  ['vencimento', /DATA DE VENCIMENTO|DATA VENC\.?|VENCIMENTO|VENC\.?/g],
  ['parcela', /N[º°O]\.? ?PARC(?:ELA)?|PARCELA|PARC\.?/g],
  ['receita', /C\. ?RECEITA|COD\.? ?RECEITA|RECEITA|DESCRICAO|HISTORICO/g],
]

/** Texto da linha + função que converte posição no texto em coordenada x. */
function joinWithPositions(line: Line): { text: string; x: (i: number) => number } {
  let text = ''
  const spans: { start: number; cell: Cell }[] = []
  line.cells.forEach((cell, k) => {
    if (k > 0) text += ' '
    spans.push({ start: text.length, cell })
    text += cell.text
  })
  return {
    text,
    x: (i: number) => {
      let span = spans[0]
      for (const s of spans) if (s.start <= i) span = s
      return span ? xAt(span.cell, Math.min(i - span.start, span.cell.text.length)) : 0
    },
  }
}

function isTableHeader(norm: string): boolean {
  return /VENC/.test(norm) && /(PARC|VALOR|VLR)/.test(norm) && !new RegExp(DATE_RE.source).test(norm) && !new RegExp(MONEY_RE.source).test(norm)
}

function buildAnchors(line: Line): Anchors {
  const { text, x } = joinWithPositions(line)
  const norm = normalizeKeepLength(text)
  const used: [number, number][] = []
  const anchors: Anchors = {}
  for (const [key, re] of COLS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(norm))) {
      const s = m.index
      const e = s + m[0].length
      if (used.some(([a, b]) => s < b && e > a)) continue
      used.push([s, e])
      if (anchors[key] === undefined) anchors[key] = (x(s) + x(e - 1)) / 2
      break
    }
  }
  return anchors
}

type Token = { kind: 'date' | 'money'; raw: string; start: number; end: number; xc: number }

function tokenizeRow(line: Line): { text: string; tokens: Token[] } {
  const { text, x } = joinWithPositions(line)
  const tokens: Token[] = []
  for (const m of text.matchAll(new RegExp(DATE_RE.source, 'g'))) {
    tokens.push({ kind: 'date', raw: m[0], start: m.index!, end: m.index! + m[0].length, xc: (x(m.index!) + x(m.index! + m[0].length - 1)) / 2 })
  }
  for (const m of text.matchAll(new RegExp(MONEY_RE.source, 'g'))) {
    const s = m.index!
    const e = s + m[0].length
    if (tokens.some((t) => s < t.end && e > t.start)) continue
    tokens.push({ kind: 'money', raw: m[0], start: s, end: e, xc: (x(s) + x(e - 1)) / 2 })
  }
  tokens.sort((a, b) => a.start - b.start)
  return { text, tokens }
}

type Values = { p: number | null; d: number | null; l: number | null; pago: number | null }

function consistent(v: Values): boolean {
  if (v.p === null || v.l === null) return v.p !== null || v.l !== null
  const d = v.d ?? 0
  return Math.abs(v.p - d - v.l) <= 1
}

function semanticAssign(before: number[], after: number[], hasPayDate: boolean): Values {
  const v: Values = { p: null, d: null, l: null, pago: hasPayDate ? (after[0] ?? null) : null }
  const [b0, b1, b2, b3] = before
  const n = before.length
  if (n === 1) {
    v.p = b0
    v.l = b0
  } else if (n === 2) {
    if (!hasPayDate && b1 === 0 && b0 > 0) {
      v.p = b0
      v.l = b0
      v.pago = 0
    } else {
      v.p = b0
      v.l = b1
      v.d = b0 >= b1 ? b0 - b1 : null
    }
  } else if (n === 3) {
    if (Math.abs(b0 - b1 - b2) <= 1) {
      v.p = b0; v.d = b1; v.l = b2
    } else if (!hasPayDate && b2 === 0 && b0 >= b1) {
      v.p = b0; v.l = b1; v.d = b0 - b1; v.pago = 0
    } else {
      v.p = b0; v.d = b1; v.l = b2
    }
  } else if (n >= 4) {
    v.p = b0; v.d = b1; v.l = b2
    if (!hasPayDate) v.pago = b3
  }
  return v
}

function positionalAssign(moneys: Token[], anchors: Anchors): Values | null {
  const cols: ColKey[] = (['valorParcela', 'desconto', 'valorLiquido', 'valorPago'] as ColKey[]).filter((k) => anchors[k] !== undefined)
  if (cols.length < 2) return null
  const v: Values = { p: null, d: null, l: null, pago: null }
  const map: Record<string, keyof Values> = { valorParcela: 'p', desconto: 'd', valorLiquido: 'l', valorPago: 'pago' }
  for (const t of moneys) {
    let best = cols[0]
    for (const c of cols) if (Math.abs(anchors[c]! - t.xc) < Math.abs(anchors[best]! - t.xc)) best = c
    const slot = map[best]
    if (v[slot] !== null) return null // duas moedas na mesma coluna: posição não confiável
    v[slot] = parseMoneyToCents(t.raw)
  }
  if (v.l === null && v.p !== null && anchors.valorLiquido === undefined) v.l = v.p - (v.d ?? 0)
  return v
}

const TOTAL_RE = /^(?:SUB)?TOTA(?:L|IS)|\bTOTAL\b|^SALDO|^RESUMO/

function tryParseRow(line: Line, anchors: Anchors | null): RawInstallment | null {
  const { text, tokens } = tokenizeRow(line)
  const dates = tokens.filter((t) => t.kind === 'date' && parseDateBR(t.raw))
  const moneys = tokens.filter((t) => t.kind === 'money')
  if (dates.length === 0 || moneys.length === 0) return null
  const norm = normalizeKeepLength(text)
  if (TOTAL_RE.test(norm.trim())) return null

  const avisos: string[] = []

  // Datas: vencimento e (opcional) pagamento
  let venc = dates[0]
  let pay: Token | undefined = dates[1]
  if (anchors?.vencimento !== undefined && anchors?.dataPagamento !== undefined && dates.length === 1) {
    const d = dates[0]
    if (Math.abs(d.xc - anchors.dataPagamento) < Math.abs(d.xc - anchors.vencimento)) {
      // só existe data de pagamento? Linha sem vencimento — inválida
      return null
    }
  }
  if (dates.length > 2) avisos.push('Linha com mais de duas datas; foram usadas as duas primeiras.')

  const before = moneys.filter((m) => !pay || m.start < pay.start)
  const after = moneys.filter((m) => pay && m.start > pay.start)
  const cents = (ts: Token[]) => ts.map((t) => parseMoneyToCents(t.raw)!).filter((n) => n !== null)

  let values: Values | null = anchors ? positionalAssign(moneys, anchors) : null
  const semantic = semanticAssign(cents(before), cents(after), !!pay)
  if (!values || (!consistent(values) && consistent(semantic))) values = semantic
  if (!consistent(values)) avisos.push('Valores da parcela não batem (parcela − desconto ≠ líquido). Confira no relatório.')

  // Receita e número da parcela: o que vem antes do vencimento
  const prefix = text.slice(0, venc.start).replace(/\s+/g, ' ').trim()
  const words = prefix.split(' ').filter(Boolean)
  let parcela = ''
  let idx = words.findIndex((w) => /^\d{1,2}\/\d{1,2}$/.test(w))
  if (idx < 0 && words.length > 1 && /^\d{1,3}$/.test(words[words.length - 1])) idx = words.length - 1
  if (idx >= 0) {
    parcela = words[idx]
    words.splice(idx, 1)
  }
  const receita = words.join(' ').replace(/^[-–|\s]+|[-–|\s]+$/g, '')

  return {
    receita,
    parcela,
    vencimento: parseDateBR(venc.raw)!,
    valorParcelaCents: values.p,
    descontoCents: values.d,
    valorLiquidoCents: values.l,
    dataPagamento: pay ? parseDateBR(pay.raw) : null,
    valorPagoCents: values.pago,
    linha: lineText(line, '  '),
    avisos,
  }
}

// ─── Blocos por aluno ──────────────────────────────────────────────────────

type Person = 'aluno' | 'responsavel' | null

type Block = {
  aluno: string
  responsavel: string
  turma: string
  matricula: string
  cpfs: { v: string; who: Person }[]
  emails: { v: string; who: Person }[]
  phones: { v: string; who: Person }[]
  headerText: string[]
  parcelas: RawInstallment[]
  pagina: number
  lastPerson: Person
}

const newBlock = (page: number): Block => ({
  aluno: '', responsavel: '', turma: '', matricula: '', cpfs: [], emails: [], phones: [],
  headerText: [], parcelas: [], pagina: page, lastPerson: null,
})

/** Remove "lixo" que às vezes gruda no nome (CPF, números, rótulos sem dois-pontos). */
function cleanName(v: string): string {
  let s = v.split(/[0-9@:|]/)[0]
  s = s.replace(/\s+(CPF|RG|TEL|FONE|CEL|E-?MAIL)\.?\s*$/i, '')
  return s.replace(/[\s,;/–-]+$/, '').replace(/\s+/g, ' ').trim()
}

function toRecord(b: Block, prev: RawRecord | null): RawRecord {
  const avisos: string[] = []
  const pick = (arr: { v: string; who: Person }[]) => (arr.find((x) => x.who === 'responsavel') ?? arr.find((x) => x.who !== 'aluno') ?? arr[0])?.v ?? ''
  let cpf = pick(b.cpfs)
  let email = pick(b.emails)
  let celular = pick(b.phones)
  if (cpf && !b.cpfs.some((x) => x.who === 'responsavel') && b.cpfs.every((x) => x.who === 'aluno')) {
    avisos.push('O CPF encontrado pode ser do aluno, e não do responsável. Confira.')
  }

  // Busca de reserva no cabeçalho do bloco
  const header = b.headerText.join('  ')
  if (!cpf) cpf = header.match(CPF_RE)?.[0] ?? ''
  if (!email) email = header.match(EMAIL_RE)?.[0] ?? ''
  if (!celular) celular = header.match(/\(?\d{2}\)?\s*9\s?\d{4}[\s.-]?\d{4}/)?.[0] ?? ''

  let responsavel = b.responsavel
  if (!responsavel && prev && prev.responsavel) {
    responsavel = prev.responsavel
    cpf = cpf || prev.cpf
    email = email || prev.email
    celular = celular || prev.celular
    avisos.push('O responsável não aparece neste bloco; foi considerado o mesmo do aluno anterior. Confira.')
  }
  return {
    aluno: b.aluno,
    responsavel,
    cpf,
    email,
    celular,
    turma: b.turma,
    matricula: b.matricula,
    pagina: b.pagina,
    parcelas: b.parcelas,
    avisos,
  }
}

export function parseReport(lines: Line[]): ParseResult {
  const records: RawRecord[] = []
  const avisos: string[] = []
  let cur: Block | null = null
  let anchors: Anchors | null = null
  let pending: Seg[] | null = null
  let orphans = 0

  const flush = () => {
    if (cur && (cur.aluno || cur.responsavel || cur.parcelas.length)) {
      records.push(toRecord(cur, records[records.length - 1] ?? null))
    }
    cur = null
  }

  const apply = (pairs: { key: FieldKey; value: string }[], page: number) => {
    for (const { key, value: raw } of pairs) {
      const value = raw.trim()
      if (!value) continue
      if (key === 'aluno' || key === 'responsavel') {
        const name = cleanName(value)
        if (!name) continue
        if (cur && (cur.parcelas.length > 0 || cur[key])) flush()
        if (!cur) cur = newBlock(page)
        cur[key] = name
        cur.lastPerson = key
        // CPF colado no nome ("MARIA SILVA 123.456.789-09")
        const cpfInName = value.match(CPF_RE)?.[0]
        if (cpfInName) cur.cpfs.push({ v: cpfInName, who: key })
        continue
      }
      if (!cur) continue
      const c = cur as Block
      switch (key) {
        case 'cpf': c.cpfs.push({ v: value, who: c.lastPerson }); break
        case 'email': c.emails.push({ v: value, who: c.lastPerson }); break
        case 'celular': c.phones.push({ v: value, who: c.lastPerson }); break
        case 'turma': if (!c.turma) c.turma = value; break
        case 'matricula': if (!c.matricula) c.matricula = value; break
        default: break
      }
    }
  }

  for (const line of lines) {
    if (line.cells.length === 0) continue
    const text = lineText(line, ' ')
    const norm = normalizeKeepLength(text)

    if (isTableHeader(norm)) {
      anchors = buildAnchors(line)
      pending = null
      continue
    }

    const row = tryParseRow(line, anchors)
    if (row) {
      pending = null
      if (cur) (cur as Block).parcelas.push(row)
      else orphans++
      continue
    }

    const segs = segmentLine(line)
    const labeled = segs.filter((s) => s.key !== null)

    // Valores na linha de baixo dos rótulos (layout em colunas)
    if (pending && labeled.length === 0) {
      const sorted = [...pending].sort((a, b) => a.x0 - b.x0)
      const values: Record<string, string> = {}
      for (const cell of line.cells) {
        let owner = sorted[0]
        for (const p of sorted) if (p.x0 <= cell.x0 + 6) owner = p
        values[owner.key!] = ((values[owner.key!] ?? '') + ' ' + cell.text).trim()
      }
      apply(sorted.map((p) => ({ key: p.key!, value: values[p.key!] ?? '' })), line.page)
      if (cur) (cur as Block).headerText.push(text)
      pending = null
      continue
    }
    pending = null

    if (labeled.length === 0) {
      if (cur && (cur as Block).parcelas.length === 0) (cur as Block).headerText.push(text)
      continue
    }

    if (labeled.every((s) => !s.value)) {
      pending = labeled
      continue
    }

    apply(labeled.map((s) => ({ key: s.key!, value: s.value })), line.page)
    if (cur) (cur as Block).headerText.push(text)
  }
  flush()

  if (orphans > 0) avisos.push(`${orphans} linha(s) com cara de parcela apareceram antes de qualquer aluno e foram ignoradas.`)
  if (records.length === 0) avisos.push('Nenhum aluno foi identificado. O layout do relatório pode ser diferente do esperado.')

  return { records, avisos, linhasOrfas: orphans, totalLinhas: lines.length }
}
