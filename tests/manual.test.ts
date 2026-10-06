import { describe, expect, it } from 'vitest'
import { composeMessages, toComposeSettings } from '@/lib/billing/compose'
import type { Installment } from '@/lib/billing/rules'
import { monthLabel } from '@/lib/format'
import { emailUrl, isMobileDevice, whatsappUrl } from '@/lib/open-links'
import { DEFAULT_SETTINGS, effective } from '@/lib/settings'

const inst = (venc: string, cents: number): Installment => ({
  receita: 'MENSALIDADE', parcela: '', vencimento: venc, mes: monthLabel(venc), valorParcelaCents: cents, descontoCents: 0,
  valorLiquidoCents: cents, dataPagamento: null, valorPagoCents: 0, emAbertoCents: cents, situacao: 'vencida', cobrar: true, avisos: [],
})
const charge = {
  guardian_name: 'João da Silva', guardian_cpf: '52998224725', student_name: 'Pedro da Silva', class_name: '6º ANO A',
  installments: [inst('2026-04-15', 54300), inst('2026-05-15', 54300)], total_open_cents: 108600,
  wa_text_override: null, wa_params_override: null, email_subject_override: null, email_body_override: null,
}

describe('envio manual', () => {
  it('usa o texto livre completo no WhatsApp (sem modelo da Meta)', () => {
    const cs = toComposeSettings(effective({ ...DEFAULT_SETTINGS, send_mode: 'manual', wa_mode: 'template', wa_template_name: 'x' }), '2026-10-05')
    const m = composeMessages(charge, cs)
    expect(m.whatsapp.mode).toBe('texto')
    expect(m.whatsapp.preview).toContain('Abril/2026 – R$ 543,00\nMaio/2026 – R$ 543,00')
  })
  it('no automático continua usando o modelo aprovado', () => {
    const cs = toComposeSettings(effective({ ...DEFAULT_SETTINGS, send_mode: 'automatico', wa_mode: 'template', wa_template_name: 'x' }), '2026-10-05')
    expect(composeMessages(charge, cs).whatsapp.mode).toBe('template')
  })
  it('monta os links do WhatsApp com número e texto', () => {
    const text = 'Olá, João.\nTotal: R$ 1.086,00 & cia'
    expect(whatsappUrl('5583996010331', text, 'web', false)).toBe(`https://web.whatsapp.com/send?phone=5583996010331&text=${encodeURIComponent(text)}`)
    expect(whatsappUrl('5583996010331', text, 'app', false)).toMatch(/^whatsapp:\/\/send\?phone=5583996010331&text=/)
    expect(whatsappUrl('5583996010331', text, 'web', true)).toMatch(/^https:\/\/wa\.me\/5583996010331\?text=Ol%C3%A1/)
    expect(decodeURIComponent(whatsappUrl('5583996010331', text, 'web', true).split('text=')[1])).toBe(text)
  })
  it('monta os links de e-mail (programa padrão, Gmail e Outlook)', () => {
    const mailto = emailUrl('joao@exemplo.com', 'Pendência – IEG', 'Linha 1\nLinha 2', 'padrao')
    expect(mailto).toBe('mailto:joao@exemplo.com?subject=Pend%C3%AAncia%20%E2%80%93%20IEG&body=Linha%201%0D%0ALinha%202')
    expect(emailUrl('joao@exemplo.com', 'A', 'B', 'gmail')).toBe('https://mail.google.com/mail/?view=cm&fs=1&to=joao%40exemplo.com&su=A&body=B')
    expect(emailUrl('joao@exemplo.com', 'A', 'B', 'outlook')).toMatch(/^https:\/\/outlook\.office\.com\/mail\/deeplink\/compose\?to=/)
  })
  it('detecta celular', () => {
    expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })
})
