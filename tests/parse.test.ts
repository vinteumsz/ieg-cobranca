import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCharges, recomputeOpenAmounts, type RuleSettings } from '@/lib/billing/rules'
import { extractDocument } from '@/lib/pdf/extract'
import { parseReport } from '@/lib/pdf/parse'

const TODAY = '2026-10-05'
const RULES: RuleSettings = { open_rule: 'sem_pagamento_ou_zerado', only_overdue: true, grace_days: 0, amount_basis: 'parcela' }

async function load(file: string) {
  const data = new Uint8Array(readFileSync(path.join(__dirname, 'fixtures', file)))
  const doc = await extractDocument(data)
  return parseReport(doc.lines)
}

describe.each(['layout-inline.pdf', 'layout-colunas.pdf', 'layout-celulas.pdf'])('leitura do relatório (%s)', (file) => {
  it('identifica alunos, responsáveis e contatos', async () => {
    const res = await load(file)
    const alunos = [...new Set(res.records.map((r) => r.aluno.toUpperCase()))]
    expect(alunos).toEqual(['PEDRO DA SILVA', 'ANA BEATRIZ SOUZA', 'CARLOS EDUARDO OLIVEIRA', 'LUCAS OLIVEIRA', 'SOFIA RAMOS PEREIRA'])
    const pedro = res.records.find((r) => r.aluno.toUpperCase() === 'PEDRO DA SILVA')!
    expect(pedro.responsavel.toUpperCase()).toBe('JOÃO DA SILVA')
    expect(pedro.cpf).toBe('529.982.247-25')
    expect(pedro.email).toBe('joao.silva@exemplo.com.br')
    expect(pedro.celular).toContain('99601-0331')
    expect(pedro.turma).toBe('6º ANO A')
  })

  it('lê as parcelas, inclusive desconto em branco e pagamentos', async () => {
    const res = await load(file)
    const pedro = res.records.filter((r) => r.aluno.toUpperCase() === 'PEDRO DA SILVA').flatMap((r) => r.parcelas)
    expect(pedro).toHaveLength(12)
    expect(pedro[0]).toMatchObject({ receita: 'MENSALIDADE', parcela: '01/12', vencimento: '2026-01-15', valorParcelaCents: 60300, descontoCents: 6000, valorLiquidoCents: 54300, dataPagamento: '2026-01-03', valorPagoCents: 54300 })
    expect(pedro[3]).toMatchObject({ vencimento: '2026-04-15', dataPagamento: null, valorPagoCents: 0 })
    expect(pedro.every((p) => p.avisos.length === 0)).toBe(true)

    const ana = res.records.find((r) => r.aluno.toUpperCase() === 'ANA BEATRIZ SOUZA')!
    expect(ana.parcelas[0]).toMatchObject({ receita: 'MATRÍCULA 2026', valorParcelaCents: 45000, valorLiquidoCents: 45000, dataPagamento: '2026-01-10' })
    const ana9 = ana.parcelas.find((p) => p.vencimento === '2026-09-15')!
    expect(ana9).toMatchObject({ valorParcelaCents: 60300, valorLiquidoCents: 60300, dataPagamento: null, valorPagoCents: 0 })
    expect(ana.email).toBe('')
  })

  it('agrupa por responsável + aluno e calcula o total vencido', async () => {
    const res = await load(file)
    const { charges, stats } = buildCharges(res.records, RULES, TODAY)
    const byStudent = Object.fromEntries(charges.map((c) => [c.student_name, c]))

    expect(Object.keys(byStudent).sort()).toEqual(['Ana Beatriz Souza', 'Lucas Oliveira', 'Pedro da Silva', 'Sofia Ramos Pereira'])
    // Pedro: abril a setembro vencidas (6 × 603,00, valor cheio); outubro a dezembro ainda a vencer
    expect(byStudent['Pedro da Silva'].open_count).toBe(6)
    expect(byStudent['Pedro da Silva'].upcoming_count).toBe(3)
    expect(byStudent['Pedro da Silva'].total_open_cents).toBe(6 * 60300)
    expect(byStudent['Pedro da Silva'].installments.filter((i) => i.cobrar).map((i) => i.mes)).toEqual([
      'Abril/2026', 'Maio/2026', 'Junho/2026', 'Julho/2026', 'Agosto/2026', 'Setembro/2026',
    ])
    expect(byStudent['Ana Beatriz Souza'].total_open_cents).toBe(60300)
    expect(byStudent['Ana Beatriz Souza'].guardian_phone).toBe('5583988881234')
    expect(byStudent['Ana Beatriz Souza'].warnings.map((w) => w.code)).toContain('sem_email')
    expect(byStudent['Lucas Oliveira'].total_open_cents).toBe(60300)
    expect(byStudent['Lucas Oliveira'].guardian_phone).toBe('5583987776655')
    expect(byStudent['Sofia Ramos Pereira'].open_count).toBe(9)
    expect(byStudent['Sofia Ramos Pereira'].total_open_cents).toBe(9 * 60300)

    expect(stats.cobrancas).toBe(4)
    expect(stats.alunosSemPendencia).toBe(1)
    expect(stats.totalCents).toBe(6 * 60300 + 60300 + 60300 + 9 * 60300)
    expect(charges.some((c) => c.warnings.some((w) => w.code === 'valores_inconsistentes'))).toBe(false)
  })
})

describe('regras configuráveis', () => {
  it('pagamento parcial entra quando a regra é "valor pago menor que a parcela"', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, open_rule: 'pago_menor_que_liquido' }, TODAY)
    const lucas = charges.find((c) => c.student_name === 'Lucas Oliveira')!
    // agosto: 603 − 300 = 303; setembro: 603
    expect(lucas.total_open_cents).toBe(30300 + 60300)
    // quem pagou o valor com desconto em dia não fica devendo a diferença
    expect(charges.find((c) => c.student_name === 'Pedro da Silva')!.open_count).toBe(6)
    expect(charges.some((c) => c.student_name === 'Carlos Eduardo Oliveira')).toBe(false)
  })

  it('sem o filtro de vencidas, parcelas futuras também entram', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, only_overdue: false }, TODAY)
    expect(charges.find((c) => c.student_name === 'Pedro da Silva')!.open_count).toBe(9)
  })

  it('valor base pode ser o valor líquido (com desconto)', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, amount_basis: 'liquido' }, TODAY)
    expect(charges.find((c) => c.student_name === 'Pedro da Silva')!.total_open_cents).toBe(6 * 54300)
  })

  it('recalcula cobranças já gravadas quando a base do valor muda', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, amount_basis: 'liquido' }, TODAY)
    const pedro = charges.find((c) => c.student_name === 'Pedro da Silva')!
    const r = recomputeOpenAmounts(pedro.installments, { open_rule: RULES.open_rule, amount_basis: 'parcela' })
    expect(r.total_open_cents).toBe(6 * 60300)
    expect(r.installments.filter((i) => !i.cobrar).every((i) => i.emAbertoCents === 60300)).toBe(true)
  })
})

describe('layout do sistema da escola (ALUNO: matrícula - nome, turma na tabela)', () => {
  it('identifica aluno depois da matrícula, responsável, contatos e turma', async () => {
    const res = await load('layout-ieg.pdf')
    expect(res.records.map((r) => [r.matricula, r.aluno, r.responsavel])).toEqual([
      ['1733', 'ANA CLARA SILVA CAVALCANTI', 'THIAGO DE OLIVEIRA COSTA CAVALCANTI'],
      ['1802', 'MIGUEL ARAÚJO LIMA', 'PATRÍCIA ARAÚJO LIMA'],
      ['1650', 'BEATRIZ MOURA COSTA', 'CARLOS MOURA COSTA'],
      ['1650', 'BEATRIZ MOURA COSTA', 'FERNANDA MOURA COSTA'],
      ['1901', 'LUCAS BARBOSA NETO', 'JOSÉ BARBOSA NETO'],
      ['1902', 'LARA BARBOSA NETO', 'JOSÉ BARBOSA NETO'],
      ['2010', 'DAVI RÊGO', 'HELENA RÊGO'],
    ])
    const ana = res.records[0]
    expect(ana).toMatchObject({ cpf: '529.982.247-25', email: 'enterltda@hotmail.com', celular: '(83)98767-7071', turma: '7° ANO' })
    expect(res.records[1].celular).toBe('(83)99812-3344') // telefone residencial não vira celular
    expect(res.records[6]).toMatchObject({ celular: '', email: '', turma: '2° ANO' })
    expect(res.records.every((r) => r.avisos.length === 0)).toBe(true)
  })

  it('lê as colunas PARC(R$), DESC(R$), LIQUIDO(R$) e ignora o DESC(%)', async () => {
    const res = await load('layout-ieg.pdf')
    expect(res.records[0].parcelas).toEqual([
      expect.objectContaining({ turma: '7° ANO', receita: 'MENSALIDADE', parcela: '08/11', vencimento: '2026-09-30', valorParcelaCents: 62600, descontoCents: 5008, valorLiquidoCents: 57592, dataPagamento: null, valorPagoCents: null, avisos: [] }),
    ])
    expect(res.records[1].parcelas[0]).toMatchObject({ valorParcelaCents: 125000, descontoCents: 0, valorLiquidoCents: 125000 })
    expect(res.records[4].parcelas[0]).toMatchObject({ dataPagamento: '2026-08-05', valorPagoCents: 80100 })
    // tabela que continua na página seguinte
    expect(res.records[5].parcelas).toHaveLength(11)
    expect(res.records.flatMap((r) => r.parcelas).every((p) => p.avisos.length === 0)).toBe(true)
  })

  it('monta as cobranças pelo valor cheio, sem alertas de leitura', async () => {
    const res = await load('layout-ieg.pdf')
    const { charges, stats } = buildCharges(res.records, RULES, TODAY)
    const by = (aluno: string, resp: string) => charges.find((c) => c.student_name === aluno && c.guardian_name === resp)!
    expect(by('Ana Clara Silva Cavalcanti', 'Thiago de Oliveira Costa Cavalcanti')).toMatchObject({ total_open_cents: 62600, open_count: 1, class_name: '7° ANO', guardian_phone: '5583987677071' })
    expect(by('Miguel Araújo Lima', 'Patrícia Araújo Lima')).toMatchObject({ total_open_cents: 3 * 125000, open_count: 3, upcoming_count: 1 })
    expect(by('Beatriz Moura Costa', 'Carlos Moura Costa').total_open_cents).toBe(2 * 31300)
    expect(by('Beatriz Moura Costa', 'Fernanda Moura Costa').total_open_cents).toBe(31300)
    expect(by('Lucas Barbosa Neto', 'José Barbosa Neto')).toMatchObject({ total_open_cents: 89000, open_count: 1 })
    expect(by('Lara Barbosa Neto', 'José Barbosa Neto')).toMatchObject({ total_open_cents: 8 * 74000, open_count: 8, upcoming_count: 3 })
    expect(by('Davi Rêgo', 'Helena Rêgo').warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['sem_celular', 'sem_email']))
    expect(charges).toHaveLength(7)
    expect(stats.comAlertaCritico).toBe(0)
    expect(charges.flatMap((c) => c.warnings.map((w) => w.code))).not.toContain('sem_aluno')
    expect(charges.flatMap((c) => c.warnings.map((w) => w.code))).not.toContain('valores_inconsistentes')
  })
})
