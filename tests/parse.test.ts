import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCharges, type RuleSettings } from '@/lib/billing/rules'
import { extractDocument } from '@/lib/pdf/extract'
import { parseReport } from '@/lib/pdf/parse'

const TODAY = '2026-10-05'
const RULES: RuleSettings = { open_rule: 'sem_pagamento_ou_zerado', only_overdue: true, grace_days: 0, amount_basis: 'liquido' }

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
    // Pedro: abril a setembro vencidas (6 × 543,00); outubro a dezembro ainda a vencer
    expect(byStudent['Pedro da Silva'].open_count).toBe(6)
    expect(byStudent['Pedro da Silva'].upcoming_count).toBe(3)
    expect(byStudent['Pedro da Silva'].total_open_cents).toBe(325800)
    expect(byStudent['Pedro da Silva'].installments.filter((i) => i.cobrar).map((i) => i.mes)).toEqual([
      'Abril/2026', 'Maio/2026', 'Junho/2026', 'Julho/2026', 'Agosto/2026', 'Setembro/2026',
    ])
    expect(byStudent['Ana Beatriz Souza'].total_open_cents).toBe(60300)
    expect(byStudent['Ana Beatriz Souza'].guardian_phone).toBe('5583988881234')
    expect(byStudent['Ana Beatriz Souza'].warnings.map((w) => w.code)).toContain('sem_email')
    expect(byStudent['Lucas Oliveira'].total_open_cents).toBe(54300)
    expect(byStudent['Lucas Oliveira'].guardian_phone).toBe('5583987776655')
    expect(byStudent['Sofia Ramos Pereira'].open_count).toBe(9)
    expect(byStudent['Sofia Ramos Pereira'].total_open_cents).toBe(9 * 54300)

    expect(stats.cobrancas).toBe(4)
    expect(stats.alunosSemPendencia).toBe(1)
    expect(stats.totalCents).toBe(325800 + 60300 + 54300 + 9 * 54300)
    expect(charges.some((c) => c.warnings.some((w) => w.code === 'valores_inconsistentes'))).toBe(false)
  })
})

describe('regras configuráveis', () => {
  it('pagamento parcial entra quando a regra é "valor pago menor que a parcela"', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, open_rule: 'pago_menor_que_liquido' }, TODAY)
    const lucas = charges.find((c) => c.student_name === 'Lucas Oliveira')!
    // agosto: 543 − 300 = 243; setembro: 543
    expect(lucas.total_open_cents).toBe(24300 + 54300)
  })

  it('sem o filtro de vencidas, parcelas futuras também entram', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, only_overdue: false }, TODAY)
    expect(charges.find((c) => c.student_name === 'Pedro da Silva')!.open_count).toBe(9)
  })

  it('valor base pode ser o valor da parcela (sem desconto)', async () => {
    const res = await load('layout-inline.pdf')
    const { charges } = buildCharges(res.records, { ...RULES, amount_basis: 'parcela' }, TODAY)
    expect(charges.find((c) => c.student_name === 'Pedro da Silva')!.total_open_cents).toBe(6 * 60300)
  })
})
