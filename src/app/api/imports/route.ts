import type { NextRequest } from 'next/server'
import { ApiError, apiAuth, json, readJson, route } from '@/lib/api'
import { audit } from '@/lib/audit'
import { displayUser } from '@/lib/auth'
import { buildCharges } from '@/lib/billing/rules'
import { loadSettings } from '@/lib/data'
import { todayISO } from '@/lib/format'
import { lineText } from '@/lib/pdf/lines'
import { parseReport } from '@/lib/pdf/parse'
import type { Line } from '@/lib/pdf/types'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

type Body = {
  fileName: string
  fileSize: number
  fileHash: string
  pageCount: number
  method: 'texto' | 'ocr'
  lines: Line[]
}

function validate(b: Body): Line[] {
  if (typeof b.fileName !== 'string' || !b.fileName || b.fileName.length > 255) throw new ApiError(400, 'Nome de arquivo inválido.')
  if (!Array.isArray(b.lines) || b.lines.length === 0) throw new ApiError(422, 'O PDF não tem texto legível.')
  if (b.lines.length > 60_000) throw new ApiError(413, 'Relatório grande demais para uma única importação.')
  return b.lines.map((l) => {
    if (!l || !Array.isArray(l.cells)) throw new ApiError(400, 'Formato de linhas inválido.')
    return {
      page: Number(l.page) || 1,
      y: Number(l.y) || 0,
      cells: l.cells.slice(0, 80).map((c) => ({ text: String(c.text ?? '').slice(0, 500), x0: Number(c.x0) || 0, x1: Number(c.x1) || 0 })),
    }
  })
}

export const POST = route(async (req: NextRequest) => {
  const user = await apiAuth(req)
  const body = await readJson<Body>(req)
  const lines = validate(body)
  const settings = await loadSettings()
  const today = todayISO()

  const parsed = parseReport(lines)
  if (parsed.records.length === 0) {
    throw new ApiError(422, 'Não identificamos alunos nem responsáveis neste PDF. Confira se é o relatório financeiro correto.', {
      sample: lines.slice(0, 60).map((l) => lineText(l, '  ')),
    })
  }

  const { charges, stats } = buildCharges(parsed.records, settings, today)
  const db = createAdminClient()

  const fileHash = /^[0-9a-f]{64}$/.test(body.fileHash) ? body.fileHash : null
  let previousImport = null
  if (fileHash) {
    const { data } = await db
      .from('imports')
      .select('id, created_at, imported_by_name')
      .eq('file_hash', fileHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    previousImport = data
  }

  const { data: imp, error } = await db
    .from('imports')
    .insert({
      file_name: body.fileName,
      file_size: Number(body.fileSize) || null,
      file_hash: fileHash,
      page_count: Number(body.pageCount) || null,
      extraction_method: body.method === 'ocr' ? 'ocr' : 'texto',
      reference_date: today,
      rules_snapshot: {
        open_rule: settings.open_rule,
        only_overdue: settings.only_overdue,
        grace_days: settings.grace_days,
        amount_basis: settings.amount_basis,
      },
      stats,
      parse_warnings: parsed.avisos,
      imported_by: user.id,
      imported_by_name: displayUser(user),
    })
    .select('id')
    .single()
  if (error || !imp) throw new Error('Falha ao salvar a importação: ' + error?.message)

  for (let i = 0; i < charges.length; i += 500) {
    const chunk = charges.slice(i, i + 500).map((c) => ({ ...c, import_id: imp.id }))
    const { error: e2 } = await db.from('charges').insert(chunk)
    if (e2) {
      await db.from('imports').delete().eq('id', imp.id)
      throw new Error('Falha ao salvar as cobranças: ' + e2.message)
    }
  }

  await audit(user, 'importacao_criada', {
    entity: 'import',
    entityId: imp.id,
    details: { arquivo: body.fileName, cobrancas: stats.cobrancas, total_centavos: stats.totalCents, metodo: body.method },
  })

  return json({ importId: imp.id, stats, warnings: parsed.avisos, previousImport }, 201)
})
