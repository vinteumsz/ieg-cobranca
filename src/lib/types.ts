import type { ChargeWarning, ImportStats, Installment } from './billing/rules'

export type Role = 'admin' | 'operador'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  created_at?: string
}

export type ImportRow = {
  id: string
  file_name: string
  file_size: number | null
  file_hash: string | null
  page_count: number | null
  extraction_method: 'texto' | 'ocr'
  reference_date: string
  rules_snapshot: Record<string, unknown>
  stats: ImportStats
  parse_warnings: string[]
  storage_path: string | null
  imported_by: string | null
  imported_by_name: string | null
  created_at: string
}

export type ChargeStatus = 'pendente' | 'enviado' | 'entregue' | 'erro' | 'cancelado'
export type ChannelStatus = 'pendente' | 'enviado' | 'entregue' | 'lido' | 'erro' | 'simulado'

export type ChargeRow = {
  id: string
  import_id: string
  group_key: string
  guardian_name: string
  guardian_cpf: string | null
  guardian_email: string | null
  guardian_phone: string | null
  guardian_phone_raw: string | null
  student_name: string
  class_name: string | null
  installments: Installment[]
  open_count: number
  upcoming_count: number
  total_open_cents: number
  oldest_due: string | null
  warnings: ChargeWarning[]
  reviewed: boolean
  reviewed_at: string | null
  contact_edited: boolean
  status: ChargeStatus
  wa_status: ChannelStatus | null
  email_status: ChannelStatus | null
  wa_text_override: string | null
  wa_params_override: string[] | null
  email_subject_override: string | null
  email_body_override: string | null
  cancel_reason: string | null
  last_sent_at: string | null
  created_at: string
}

export type DispatchStatus = 'pendente' | 'enviado' | 'entregue' | 'erro' | 'cancelado' | 'simulado'

export type MessageRow = {
  id: string
  dispatch_id: string
  charge_id: string | null
  channel: 'whatsapp' | 'email'
  recipient: string
  intended_recipient: string | null
  subject: string | null
  body: string
  status: ChannelStatus | 'cancelado'
  provider: string | null
  provider_message_id: string | null
  error_message: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
}

export type DispatchRow = {
  id: string
  batch_id: string
  charge_id: string | null
  import_id: string | null
  group_key: string
  guardian_name: string
  guardian_cpf: string | null
  student_name: string
  amount_cents: number
  channels: string[]
  status: DispatchStatus
  test_mode: boolean
  note: string | null
  sent_by: string | null
  sent_by_name: string | null
  created_at: string
  messages?: MessageRow[]
}
