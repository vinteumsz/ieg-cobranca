import { describe, expect, it } from 'vitest'
import { computeDebtUpdate, dailyInterestFor, fineFor } from '@/lib/billing/interest'
import { buildVariables, renderMetaTemplate, renderTemplate, sanitizeTemplateParam, templateParamValues } from '@/lib/billing/messages'
import type { Installment } from '@/lib/billing/rules'
import {
  displayName, formatCents, isValidCpf, maskCpf, monthLabel, parseBrPhone, parseMoneyToCents, pickEmail, todayISO,
} from '@/lib/format'
import { parseReport } from '@/lib/pdf/parse'
import type { Line } from '@/lib/pdf/types'
import { DEFAULT_EMAIL_BODY, DEFAULT_WA_TEMPLATE_BODY, DEFAULT_WA_TEMPLATE_PARAMS, DEFAULT_WA_TEXT } from '@/lib/settings'

const inst = (venc: string, cents: number, cobrar = true): Installment => ({
  receita: 'MENSALIDADE', parcela: '', vencimento: venc, mes: monthLabel(venc), valorParcelaCents: cents, descontoCents: 0,
  valorLiquidoCents: cents, dataPagamento: null, valorPagoCents: 0, emAbertoCents: cents, situacao: cobrar ? 'vencida' : 'a_vencer', cobrar, avisos: [],
})

const CHARGE = {
  guardian_name: 'João da Silva',
  guardian_cpf: '52998224725',
  student_name: 'Pedro da Silva',
  class_name: '6º ANO A',
  installments: [inst('2026-04-15', 54300), inst('2026-05-15', 54300), inst('2026-06-15', 54300), inst('2026-12-15', 54300, false)],
  total_open_cents: 162900,
}
const CTX = {
  daily_interest_pct: null, fine_pct: null, interest_start_date: null, cpf_display: 'parcial' as const,
  show_updated_values: true, email_team_name: 'Equipe de Cobrança', today: '2026-10-05',
}

describe('formatação', () => {
  it('dinheiro, datas e meses', () => {
    expect(parseMoneyToCents('1.629,00')).toBe(162900)
    expect(parseMoneyToCents('R$ 543,00')).toBe(54300)
    expect(parseMoneyToCents('0,00')).toBe(0)
    expect(formatCents(162900)).toBe('R$ 1.629,00')
    expect(monthLabel('2026-04-15')).toBe('Abril/2026')
    expect(monthLabel('2026-03-10')).toBe('Março/2026')
  })
  it('CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('529.982.247-26')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(maskCpf('52998224745')).toBe('***.***.***-45')
  })
  it('telefone', () => {
    expect(parseBrPhone('(83) 99601-0331')).toMatchObject({ e164: '5583996010331', kind: 'celular' })
    expect(parseBrPhone('(83) 3264-5760')).toMatchObject({ e164: '', kind: 'fixo' })
    expect(parseBrPhone('(83) 3264-5760 / (83) 98888-1234')).toMatchObject({ e164: '5583988881234', kind: 'celular' })
    expect(parseBrPhone('+55 83 99601-0331')).toMatchObject({ e164: '5583996010331' })
    expect(parseBrPhone('83 8777-6655')).toMatchObject({ e164: '5583987776655', ninthDigitAdded: true })
    expect(parseBrPhone('')).toMatchObject({ kind: 'ausente' })
  })
  it('e-mail e nomes', () => {
    expect(pickEmail('JOAO@EXEMPLO.COM; outro@x.com')).toBe('joao@exemplo.com')
    expect(pickEmail('não informado')).toBe('')
    expect(displayName('MARIA DE FÁTIMA SOUZA')).toBe('Maria de Fátima Souza')
  })
  it('data de hoje no fuso de João Pessoa', () => {
    // 02:30 UTC de 06/10 ainda é 05/10 em João Pessoa (UTC−3)
    expect(todayISO(new Date('2026-10-06T02:30:00Z'))).toBe('2026-10-05')
  })
})

describe('juros', () => {
  it('não inventa valores quando a escola não informou taxas', () => {
    const u = computeDebtUpdate(CHARGE.installments, CTX, '2026-10-05')
    expect(u.configured).toBe(false)
    expect(u.updatedCents).toBe(162900)
  })
  it('calcula multa e juros diários simples', () => {
    const u = computeDebtUpdate([inst('2026-09-15', 100000)], { daily_interest_pct: 0.033, fine_pct: 2, interest_start_date: null }, '2026-10-05')
    expect(u.fineCents).toBe(2000) // 2%
    expect(u.interestCents).toBe(Math.round(100000 * 0.033 * 20 / 100)) // 20 dias
    expect(u.updatedCents).toBe(100000 + 2000 + 660)
  })
  it('bate com o boleto da escola: parcela de R$ 590,00 vencida em 02/11/2026', () => {
    const regras = { daily_interest_pct: 0.033, fine_pct: 2, interest_start_date: null }
    const p = [inst('2026-11-02', 59000)]
    expect(computeDebtUpdate(p, regras, '2026-11-02')).toMatchObject({ fineCents: 0, interestCents: 0, updatedCents: 59000 })
    // "A partir de 03/11/2026 cobrar multa de R$ 11,80" e "juros de R$ 0,19 por dia"
    expect(computeDebtUpdate(p, regras, '2026-11-03')).toMatchObject({ fineCents: 1180, interestCents: 19, updatedCents: 59000 + 1180 + 19 })
    expect(computeDebtUpdate(p, regras, '2026-12-03').interestCents).toBe(31 * 19)
    expect(dailyInterestFor(59000, 0.033)).toBe(19)
    expect(fineFor(59000, 2)).toBe(1180)
    // centavos para baixo (R$ 626,00 → R$ 0,2065… por dia → R$ 0,20)
    expect(dailyInterestFor(62600, 0.033)).toBe(20)
  })
  it('respeita a data inicial de cobrança dos juros', () => {
    const u = computeDebtUpdate([inst('2026-04-15', 100000)], { daily_interest_pct: 0.1, fine_pct: null, interest_start_date: '2026-10-01' }, '2026-10-05')
    expect(u.interestCents).toBe(Math.round(100000 * 0.1 * 4 / 100))
  })
})

describe('mensagens', () => {
  it('WhatsApp (texto) com lista de meses, total e CPF parcial', () => {
    const msg = renderTemplate(DEFAULT_WA_TEXT, buildVariables(CHARGE, CTX))
    expect(msg).toContain('Olá, João da Silva. Tudo bem?')
    expect(msg).toContain('Abril/2026 – R$ 543,00\nMaio/2026 – R$ 543,00\nJunho/2026 – R$ 543,00')
    expect(msg).not.toContain('Dezembro/2026')
    expect(msg).toContain('Valor total identificado: R$ 1.629,00')
    expect(msg).toContain('CPF do responsável: ***.***.***-25')
    expect(msg).toContain('juros são calculados diariamente')
    expect(msg).not.toContain('Juros acumulados')
    expect(msg).not.toMatch(/\{\{|\n{3,}/)
  })
  it('sem CPF quando a configuração é "não exibir"', () => {
    const msg = renderTemplate(DEFAULT_EMAIL_BODY, buildVariables(CHARGE, { ...CTX, cpf_display: 'nao_exibir' }))
    expect(msg).not.toContain('CPF')
    expect(msg).toContain('Pedro da Silva')
  })
  it('mostra o valor atualizado quando há taxa configurada', () => {
    const msg = renderTemplate(DEFAULT_WA_TEXT, buildVariables(CHARGE, { ...CTX, daily_interest_pct: 0.033, fine_pct: 2 }))
    expect(msg).toContain('Valor total identificado: R$ 1.629,00')
    expect(msg).toContain('Multa (2%): R$ 32,58')
    expect(msg).toContain('Juros (0,033% ao dia):')
    expect(msg).toContain('Valor atualizado em 05/10/2026:')
    expect(msg).not.toContain('Valor original')
  })
  it('parâmetros do modelo da Meta ficam em uma linha', () => {
    const params = templateParamValues(DEFAULT_WA_TEMPLATE_PARAMS, buildVariables(CHARGE, CTX))
    expect(params.every((p) => !/[\n\t]| {4,}/.test(p))).toBe(true)
    expect(params[2]).toBe('Abril/2026 – R$ 543,00; Maio/2026 – R$ 543,00; Junho/2026 – R$ 543,00')
    const preview = renderMetaTemplate(DEFAULT_WA_TEMPLATE_BODY, params)
    expect(preview).toContain('referentes ao aluno(a) Pedro da Silva.')
    expect(sanitizeTemplateParam('a\nb\t c      d')).toBe('a b c d')
  })
  it('meses seguidos com o mesmo valor viram intervalo na versão de uma linha', () => {
    const many = ['2025-11-15', '2025-12-15', '2026-01-15', '2026-02-15', '2026-03-15'].map((d) => inst(d, 58000))
    const vars = buildVariables({ ...CHARGE, installments: [...many, inst('2026-05-15', 60300)] }, CTX)
    expect(vars.lista_mensalidades_linha).toBe('Novembro/2025 a Março/2026 (5 × R$ 580,00); Maio/2026 – R$ 603,00')
    expect(vars.lista_mensalidades.split('\n')).toHaveLength(6)
  })
})

describe('parser sem cabeçalho de colunas (atribuição pela coerência dos valores)', () => {
  const L = (y: number, ...cells: [string, number][]): Line => ({ page: 1, y, cells: cells.map(([text, x]) => ({ text, x0: x, x1: x + text.length * 4 })) })
  it('desconto em branco e pagamento registrado', () => {
    const lines = [
      L(1, ['ALUNO: TESTE UM', 0], ['TURMA: 2º ANO', 300]),
      L(2, ['RESPONSÁVEL: FULANA DE TAL', 0], ['CPF: 529.982.247-25', 300]),
      L(3, ['MENSALIDADE 05/12', 0], ['15/05/2026', 100], ['500,00', 200], ['500,00', 280]),
      L(4, ['MENSALIDADE 06/12', 0], ['15/06/2026', 100], ['500,00', 200], ['50,00', 240], ['450,00', 280], ['20/06/2026', 320], ['450,00', 400]),
      L(5, ['MENSALIDADE 07/12', 0], ['15/07/2026', 100], ['500,00', 200], ['50,00', 240], ['450,00', 280], ['0,00', 400]),
    ]
    const { records } = parseReport(lines)
    expect(records).toHaveLength(1)
    const [p5, p6, p7] = records[0].parcelas
    expect(p5).toMatchObject({ parcela: '05/12', valorParcelaCents: 50000, valorLiquidoCents: 50000, descontoCents: 0, dataPagamento: null })
    expect(p6).toMatchObject({ valorLiquidoCents: 45000, dataPagamento: '2026-06-20', valorPagoCents: 45000 })
    expect(p7).toMatchObject({ valorParcelaCents: 50000, descontoCents: 5000, valorLiquidoCents: 45000, valorPagoCents: 0 })
  })
})
