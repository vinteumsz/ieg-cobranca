import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Installment } from '@/lib/billing/rules'
import { monthLabel } from '@/lib/format'
import { createFakeDb } from './helpers/fake-supabase'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import('./helpers/fake-supabase').createFakeDb>,
  user: { id: 'u-admin', email: 'admin@ieg', full_name: 'Admin', role: 'admin', active: true } as Record<string, unknown>,
  audits: [] as unknown[][],
}))

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => state.fake!.db, createUserClient: async () => state.fake!.db }))
vi.mock('@/lib/auth', () => ({ getSessionUser: async () => state.user, displayUser: (u: { full_name: string }) => u.full_name }))
vi.mock('@/lib/audit', () => ({ audit: async (...args: unknown[]) => void state.audits.push(args) }))

const { DELETE: deleteCharges } = await import('@/app/api/charges/route')
const { DELETE: deleteDispatches } = await import('@/app/api/dispatches/route')
const { PUT: putSettings } = await import('@/app/api/settings/route')

const IMP = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = 'cccccccc-0000-4000-8000-000000000001'
const C2 = 'cccccccc-0000-4000-8000-000000000002'
const C3 = 'cccccccc-0000-4000-8000-000000000003'
const D0 = 'dddddddd-0000-4000-8000-000000000000'
const D1 = 'dddddddd-0000-4000-8000-000000000001'
const D3 = 'dddddddd-0000-4000-8000-000000000003'

const inst = (venc: string, cobrar = true, pago: number | null = 0): Installment => ({
  receita: 'MENSALIDADE', parcela: '', vencimento: venc, mes: monthLabel(venc), valorParcelaCents: 60300, descontoCents: 6000,
  valorLiquidoCents: 54300, dataPagamento: null, valorPagoCents: pago, emAbertoCents: 54300, situacao: cobrar ? 'vencida' : 'a_vencer', cobrar, avisos: [],
})

const charge = (id: string, extra: Record<string, unknown> = {}) => ({
  id, import_id: IMP, group_key: `g-${id}`, guardian_name: `Resp ${id.slice(-1)}`, student_name: `Aluno ${id.slice(-1)}`,
  guardian_phone: '5583999990000', guardian_email: `r${id.slice(-1)}@ex.com`, warnings: [],
  installments: [inst('2026-08-15'), inst('2026-09-15'), inst('2026-12-15', false)],
  open_count: 2, total_open_cents: 108600, status: 'pendente', wa_status: null, email_status: null, last_sent_at: null,
  ...extra,
})

function seed() {
  return createFakeDb({
    settings: [{ id: 1, amount_basis: 'liquido', open_rule: 'sem_pagamento_ou_zerado' }],
    imports: [
      {
        id: IMP,
        stats: { alunosLidos: 4, responsaveis: 3, cobrancas: 3, parcelasCobradas: 6, parcelasAVencer: 3, totalCents: 325800, alunosSemPendencia: 1, comAlertaCritico: 0, semWhatsapp: 0, semEmail: 0 },
        rules_snapshot: { open_rule: 'sem_pagamento_ou_zerado', only_overdue: true, grace_days: 0, amount_basis: 'liquido' },
      },
    ],
    charges: [
      charge(C1),
      charge(C2, { status: 'enviado', wa_status: 'enviado', email_status: 'enviado', last_sent_at: '2026-10-01T12:00:00Z' }),
      charge(C3, { status: 'cancelado', wa_status: 'enviado', last_sent_at: '2026-09-20T12:00:00Z' }),
    ],
    dispatches: [
      { id: D0, charge_id: C2, guardian_name: 'Resp c2', student_name: 'Aluno c2', status: 'simulado', created_at: '2026-09-30T10:00:00Z' },
      { id: D1, charge_id: C2, guardian_name: 'Resp c2', student_name: 'Aluno c2', status: 'enviado', created_at: '2026-10-01T12:00:00Z' },
      { id: D3, charge_id: C3, guardian_name: 'Resp c3', student_name: 'Aluno c3', status: 'enviado', created_at: '2026-09-20T12:00:00Z' },
    ],
    messages: [
      { id: 'm0', dispatch_id: D0, charge_id: C2, channel: 'whatsapp', status: 'simulado', sent_at: '2026-09-30T10:00:00Z', created_at: '2026-09-30T10:00:00Z' },
      { id: 'm1', dispatch_id: D1, charge_id: C2, channel: 'whatsapp', status: 'enviado', sent_at: '2026-10-01T12:00:00Z', created_at: '2026-10-01T12:00:00Z' },
      { id: 'm2', dispatch_id: D1, charge_id: C2, channel: 'email', status: 'enviado', sent_at: '2026-10-01T12:00:00Z', created_at: '2026-10-01T12:00:00Z' },
      { id: 'm3', dispatch_id: D3, charge_id: C3, channel: 'whatsapp', status: 'enviado', sent_at: '2026-09-20T12:00:00Z', created_at: '2026-09-20T12:00:00Z' },
    ],
  })
}

const req = (url: string, method: string, body: unknown, origin: string | null = 'http://localhost') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { host: 'localhost', 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  })

const call = async (handler: (r: NextRequest, c: never) => Promise<Response>, r: NextRequest) => {
  const res = await handler(r, {} as never)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  state.fake = seed()
  state.user = { id: 'u-admin', email: 'admin@ieg', full_name: 'Admin', role: 'admin', active: true }
  state.audits = []
})

describe('valor cheio como débito', () => {
  it('ao trocar a base para valor cheio, recalcula cobranças e totais das importações já feitas', async () => {
    const r = await call(putSettings, req('/api/settings', 'PUT', { amount_basis: 'parcela' }))
    expect(r.status).toBe(200)
    expect(r.body.recalculadas).toBe(3)
    const t = state.fake!.tables
    const c1 = t.charges.find((c) => c.id === C1)!
    expect(c1.total_open_cents).toBe(2 * 60300)
    expect((c1.installments as Installment[]).map((i) => i.emAbertoCents)).toEqual([60300, 60300, 60300])
    expect(t.imports[0].stats).toMatchObject({ totalCents: 3 * 120600, cobrancas: 3, alunosLidos: 4 })
    expect(t.imports[0].rules_snapshot).toMatchObject({ amount_basis: 'parcela', open_rule: 'sem_pagamento_ou_zerado' })
    expect(t.settings[0].amount_basis).toBe('parcela')

    // salvar de novo sem mudar a base não recalcula
    const again = await call(putSettings, req('/api/settings', 'PUT', { amount_basis: 'parcela', grace_days: 0 }))
    expect(again.body.recalculadas).toBeNull()
  })
})

describe('apagar cobranças', () => {
  it('apaga e mantém o histórico de envios por padrão', async () => {
    const r = await call(deleteCharges, req('/api/charges', 'DELETE', { ids: [C2] }))
    expect(r.status).toBe(200)
    expect(r.body.deleted).toEqual([C2])
    const t = state.fake!.tables
    expect(t.charges.map((c) => c.id)).toEqual([C1, C3])
    expect(t.dispatches.filter((d) => d.id === D1)).toHaveLength(1)
    expect(t.dispatches.find((d) => d.id === D1)!.charge_id).toBeNull()
    expect(t.imports[0].stats).toMatchObject({ cobrancas: 2, totalCents: 2 * 108600, alunosLidos: 4 })
    expect(state.audits[0][1]).toBe('cobranca_excluida')
  })

  it('administrador pode apagar junto o histórico de envios (mensagens vão junto)', async () => {
    const r = await call(deleteCharges, req('/api/charges', 'DELETE', { ids: [C2, C3, 'nao-e-uuid'], envios: true }))
    expect(r.status).toBe(200)
    expect(r.body.envios).toBe(3)
    const t = state.fake!.tables
    expect(t.charges.map((c) => c.id)).toEqual([C1])
    expect(t.dispatches).toHaveLength(0)
    expect(t.messages).toHaveLength(0)
    expect(t.imports[0].stats).toMatchObject({ cobrancas: 1, totalCents: 108600 })
  })

  it('funcionário (não admin) apaga cobranças, mas não o histórico', async () => {
    state.user = { ...state.user, role: 'operador' }
    expect((await call(deleteCharges, req('/api/charges', 'DELETE', { ids: [C1], envios: true }))).status).toBe(403)
    expect((await call(deleteCharges, req('/api/charges', 'DELETE', { ids: [C1] }))).status).toBe(200)
    expect(state.fake!.tables.charges.map((c) => c.id)).toEqual([C2, C3])
  })

  it('valida a lista', async () => {
    expect((await call(deleteCharges, req('/api/charges', 'DELETE', { ids: [] }))).status).toBe(400)
    expect((await call(deleteCharges, req('/api/charges', 'DELETE', { ids: ['eeeeeeee-0000-4000-8000-000000000009'] }))).status).toBe(404)
  })
})

describe('apagar envios do histórico', () => {
  it('somente administradores', async () => {
    state.user = { ...state.user, role: 'operador' }
    expect((await call(deleteDispatches, req('/api/dispatches', 'DELETE', { ids: [D1] }))).status).toBe(403)
  })

  it('bloqueia requisição de outra origem', async () => {
    expect((await call(deleteDispatches, req('/api/dispatches', 'DELETE', { ids: [D1] }, 'https://malicioso.example'))).status).toBe(403)
  })

  it('apagar um "registrar envio" feito por engano devolve a cobrança ao estado anterior', async () => {
    const r = await call(deleteDispatches, req('/api/dispatches', 'DELETE', { ids: [D1] }))
    expect(r.status).toBe(200)
    const t = state.fake!.tables
    expect(t.dispatches.map((d) => d.id)).toEqual([D0, D3])
    expect(t.messages.map((m) => m.id)).toEqual(['m0', 'm3'])
    // sobrou só o envio de teste (simulado): volta a pendente, sem data de envio
    expect(t.charges.find((c) => c.id === C2)).toMatchObject({ status: 'pendente', wa_status: 'simulado', email_status: null, last_sent_at: null })
    expect(state.audits[0][1]).toBe('envio_excluido')
  })

  it('apagar todos os envios zera os canais; cancelada continua cancelada', async () => {
    await call(deleteDispatches, req('/api/dispatches', 'DELETE', { ids: [D0, D1, D3] }))
    const t = state.fake!.tables
    expect(t.charges.find((c) => c.id === C2)).toMatchObject({ status: 'pendente', wa_status: null, email_status: null, last_sent_at: null })
    expect(t.charges.find((c) => c.id === C3)).toMatchObject({ status: 'cancelado', wa_status: null, last_sent_at: null })
  })

  it('mantém o status quando ainda resta um envio real', async () => {
    await call(deleteDispatches, req('/api/dispatches', 'DELETE', { ids: [D0] }))
    expect(state.fake!.tables.charges.find((c) => c.id === C2)).toMatchObject({ status: 'enviado', wa_status: 'enviado', email_status: 'enviado', last_sent_at: '2026-10-01T12:00:00Z' })
  })
})
