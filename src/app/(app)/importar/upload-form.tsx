'use client'

import { AlertTriangle, ArrowRight, CheckCircle2, FileText, FileUp, Loader2, Lock, RotateCcw, ScanText, X } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { apiFetch, Badge, Button, Card, CardHeader, cx, Notice } from '@/components/ui'
import type { ImportStats } from '@/lib/billing/rules'
import { formatCents, formatDateTime } from '@/lib/format'
import type { Line } from '@/lib/pdf/types'

type Stage = 'idle' | 'lendo' | 'ocr' | 'analisando' | 'arquivando' | 'pronto' | 'erro'

type ImportResponse = {
  importId: string
  stats: ImportStats
  warnings: string[]
  previousImport: { id: string; created_at: string; imported_by_name: string | null } | null
}

const MAX_MB = 50

async function sha256(buf: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const compact = (lines: Line[]) =>
  lines.map((l) => ({ page: l.page, y: Math.round(l.y * 10) / 10, cells: l.cells.map((c) => ({ text: c.text, x0: Math.round(c.x0 * 10) / 10, x1: Math.round(c.x1 * 10) / 10 })) }))

export function UploadForm({ storePdf, rules }: { storePdf: boolean; rules: { openRule: string; onlyOverdue: boolean; graceDays: number; basis: string } }) {
  const [file, setFile] = useState<File | null>(null)
  const [selectedAt, setSelectedAt] = useState<Date | null>(null)
  const [drag, setDrag] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [ocrPage, setOcrPage] = useState<[number, number] | null>(null)
  const [usedOcr, setUsedOcr] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sample, setSample] = useState<string[] | null>(null)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [archiveFailed, setArchiveFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function choose(f: File | undefined | null) {
    setError(null)
    setSample(null)
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecione um arquivo PDF.')
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`O arquivo tem mais de ${MAX_MB} MB.`)
      return
    }
    setFile(f)
    setSelectedAt(new Date())
    setStage('idle')
    setResult(null)
  }

  function reset() {
    setFile(null)
    setSelectedAt(null)
    setStage('idle')
    setResult(null)
    setError(null)
    setSample(null)
    setUsedOcr(false)
    setArchiveFailed(false)
    if (input.current) input.current.value = ''
  }

  async function process() {
    if (!file) return
    setError(null)
    setSample(null)
    try {
      setStage('lendo')
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const hash = await sha256(buf)
      const { extractDocument, looksScanned } = await import('@/lib/pdf/extract')
      let doc = await extractDocument(bytes)
      if (looksScanned(doc)) {
        setStage('ocr')
        setUsedOcr(true)
        const { ocrDocument } = await import('@/lib/pdf/ocr')
        doc = await ocrDocument(bytes, (p, t) => setOcrPage([p, t]))
      }

      setStage('analisando')
      let res: ImportResponse
      try {
        res = await apiFetch<ImportResponse>('/api/imports', {
          method: 'POST',
          json: { fileName: file.name, fileSize: file.size, fileHash: hash, pageCount: doc.totalPages, method: doc.method, lines: compact(doc.lines) },
        })
      } catch (e) {
        const data = (e as { data?: { sample?: string[] } }).data
        if (data?.sample) setSample(data.sample)
        throw e
      }

      if (storePdf) {
        setStage('arquivando')
        try {
          const { uploadUrl, apikey } = await apiFetch<{ uploadUrl: string; apikey: string }>(`/api/imports/${res.importId}/arquivo`, { method: 'POST', json: {} })
          const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': 'application/pdf', apikey, 'x-upsert': 'false' } })
          if (!put.ok) throw new Error('upload')
          await apiFetch(`/api/imports/${res.importId}/arquivo`, { method: 'PATCH', json: {} })
        } catch {
          setArchiveFailed(true)
        }
      }
      setResult(res)
      setStage('pronto')
    } catch (e) {
      setStage('erro')
      setError(e instanceof Error ? e.message : 'Não foi possível processar o relatório.')
    }
  }

  const busy = ['lendo', 'ocr', 'analisando', 'arquivando'].includes(stage)
  const when = selectedAt ? formatDateTime(selectedAt) : null

  if (stage === 'pronto' && result) return <ImportResult result={result} usedOcr={usedOcr} archiveFailed={archiveFailed} onReset={reset} />

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <div className="p-5 sm:p-6">
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                choose(e.dataTransfer.files?.[0])
              }}
              className={cx(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors',
                drag ? 'border-brand bg-brand-soft' : 'border-line-strong bg-subtle',
              )}
            >
              <div className="mb-4 rounded-2xl bg-surface p-3 text-brand-strong shadow-sm ring-1 ring-line">
                <FileUp className="size-7" />
              </div>
              <p className="font-display text-lg font-semibold">Arraste o PDF do relatório aqui</p>
              <p className="mt-1 text-sm text-ink-3">ou</p>
              <Button className="mt-3" variant="primary" onClick={() => input.current?.click()}>
                Selecionar arquivo
              </Button>
              <p className="mt-4 text-xs text-ink-3">Somente PDF · até {MAX_MB} MB</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-4 rounded-xl border border-line bg-subtle p-4">
                <div className="rounded-lg bg-surface p-2.5 text-brand-strong ring-1 ring-line">
                  <FileText className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="mt-0.5 text-sm text-ink-3">
                    {(file.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB · Importação em {when?.date} às {when?.time}
                  </p>
                </div>
                {!busy && (
                  <button onClick={reset} className="rounded-md p-1.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Remover arquivo">
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {busy && (
                <ol className="space-y-2.5 text-sm">
                  <Step done={stage !== 'lendo'} active={stage === 'lendo'}>Lendo o texto do PDF</Step>
                  {usedOcr && (
                    <Step done={stage !== 'ocr'} active={stage === 'ocr'}>
                      PDF escaneado: reconhecendo o texto (OCR){ocrPage && stage === 'ocr' ? ` — página ${ocrPage[0]} de ${ocrPage[1]}` : ''}
                    </Step>
                  )}
                  <Step done={stage === 'arquivando'} active={stage === 'analisando'}>Identificando responsáveis, alunos e parcelas</Step>
                  {storePdf && <Step done={false} active={stage === 'arquivando'}>Arquivando o PDF original</Step>}
                </ol>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="brand" size="lg" onClick={process} loading={busy} icon={<ScanText className="size-4" />}>
                  {busy ? 'Processando…' : 'Processar relatório'}
                </Button>
                {!busy && (
                  <Button variant="ghost" size="lg" onClick={() => input.current?.click()}>
                    Trocar arquivo
                  </Button>
                )}
              </div>
            </div>
          )}

          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => choose(e.target.files?.[0])}
            aria-label="Selecionar PDF"
          />

          {error && (
            <div className="mt-5 space-y-3">
              <Notice tone="bad" title="Não foi possível concluir" icon={<AlertTriangle className="size-4 text-bad" />}>
                {error}
              </Notice>
              {sample && sample.length > 0 && (
                <details className="rounded-lg border border-line bg-subtle p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Ver o texto que foi lido do PDF</summary>
                  <p className="mt-2 text-xs text-ink-3">Envie estas linhas (sem dados pessoais) ao responsável técnico para ajustar a leitura ao layout do relatório.</p>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-surface p-3 font-mono text-xs leading-relaxed">{sample.join('\n')}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Regras aplicadas" description="Definidas pela administração." />
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-ink-3">Parcela em aberto</dt>
              <dd className="mt-0.5 font-medium">{rules.openRule}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Parcelas cobradas</dt>
              <dd className="mt-0.5 font-medium">
                {rules.onlyOverdue
                  ? `Somente vencidas${rules.graceDays ? ` há mais de ${rules.graceDays} dia(s)` : ''}`
                  : 'Todas em aberto, inclusive a vencer'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Valor considerado</dt>
              <dd className="mt-0.5 font-medium">{rules.basis}</dd>
            </div>
          </dl>
        </Card>
        <Notice tone="neutral" icon={<Lock className="size-4 text-ink-3" />} title="Privacidade">
          O PDF é lido aqui no seu navegador; ao sistema chegam apenas os dados necessários para a cobrança.{' '}
          {storePdf ? 'Por decisão da administração, o arquivo original também será arquivado.' : 'O arquivo original não é armazenado.'}
        </Notice>
      </div>
    </div>
  )
}

function Step({ done, active, children }: { done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <li className={cx('flex items-center gap-2.5', active ? 'text-ink' : done ? 'text-ink-2' : 'text-ink-3')}>
      {active ? (
        <Loader2 className="size-4 animate-spin text-brand-strong" />
      ) : done ? (
        <CheckCircle2 className="size-4 text-ok" />
      ) : (
        <span className="size-4 rounded-full border-2 border-line-strong" />
      )}
      {children}
    </li>
  )
}

function ImportResult({ result, usedOcr, archiveFailed, onReset }: { result: ImportResponse; usedOcr: boolean; archiveFailed: boolean; onReset: () => void }) {
  const s = result.stats
  const prev = result.previousImport ? formatDateTime(result.previousImport.created_at) : null
  return (
    <Card>
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-7 text-ok" />
          <h2 className="text-xl font-semibold">Relatório processado</h2>
        </div>
        <p className="mt-2 text-ink-2">
          Encontramos <strong className="text-ink">{s.responsaveis} responsáve{s.responsaveis === 1 ? 'l' : 'is'}</strong> e{' '}
          <strong className="text-ink">{s.cobrancas} cobrança{s.cobrancas === 1 ? '' : 's'}</strong> para conferir.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            ['Responsáveis', String(s.responsaveis)],
            ['Cobranças', String(s.cobrancas)],
            ['Parcelas cobradas', String(s.parcelasCobradas)],
            ['Total em aberto', formatCents(s.totalCents)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-4">
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd className="mt-1 font-display text-xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {s.comAlertaCritico > 0 && <Badge tone="bad">{s.comAlertaCritico} com alerta para revisar</Badge>}
          {s.semWhatsapp > 0 && <Badge tone="warn">{s.semWhatsapp} sem celular válido</Badge>}
          {s.semEmail > 0 && <Badge tone="warn">{s.semEmail} sem e-mail</Badge>}
          <Badge>{s.alunosLidos} aluno(s) no relatório</Badge>
          {s.alunosSemPendencia > 0 && <Badge>{s.alunosSemPendencia} sem pendência vencida</Badge>}
          {s.parcelasAVencer > 0 && <Badge tone="accent">{s.parcelasAVencer} parcela(s) a vencer não entram na cobrança</Badge>}
          {usedOcr && <Badge tone="brand">Lido por OCR — confira com atenção</Badge>}
        </div>

        <div className="mt-5 space-y-2">
          {prev && (
            <Notice tone="warn" title="Este mesmo arquivo já foi importado">
              Em {prev.date} às {prev.time}
              {result.previousImport?.imported_by_name ? ` por ${result.previousImport.imported_by_name}` : ''}. Cuidado para não cobrar duas vezes — o sistema também avisa antes de reenviar.
            </Notice>
          )}
          {archiveFailed && <Notice tone="warn" title="O PDF original não foi arquivado">A leitura foi concluída normalmente; apenas o arquivamento falhou.</Notice>}
          {result.warnings.map((w) => (
            <Notice key={w} tone="warn">{w}</Notice>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-2">
          <Link
            href={`/importacoes/${result.importId}`}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-strong px-5 text-[15px] font-semibold text-white hover:bg-brand-hover"
          >
            Ir para a conferência <ArrowRight className="size-4" />
          </Link>
          <Button variant="ghost" size="lg" onClick={onReset} icon={<RotateCcw className="size-4" />}>
            Importar outro
          </Button>
        </div>
      </div>
    </Card>
  )
}
