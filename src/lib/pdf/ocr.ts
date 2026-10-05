// OCR de reserva para PDFs escaneados. Roda NO NAVEGADOR (tesseract.js), página a página.
// Os arquivos do motor de OCR (≈ 15 MB, só na primeira vez) vêm do CDN jsDelivr.
import { createWorker } from 'tesseract.js'
import { getDocumentProxy, renderPageAsImage } from 'unpdf'
import { groupIntoLines, type PositionedText } from './lines'
import type { ExtractedDocument, Line } from './types'

export async function ocrDocument(
  data: Uint8Array,
  onProgress: (page: number, total: number) => void,
): Promise<ExtractedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(data))
  const total = pdf.numPages
  const worker = await createWorker('por')
  const lines: Line[] = []
  let charCount = 0
  try {
    for (let p = 1; p <= total; p++) {
      onProgress(p, total)
      const image = await renderPageAsImage(pdf, p, { scale: 2.5, toDataURL: true })
      const { data: result } = await worker.recognize(image, {}, { blocks: true })
      const items: PositionedText[] = []
      for (const block of result.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            for (const w of line.words) {
              if (!w.text.trim() || w.confidence < 20) continue
              const h = w.bbox.y1 - w.bbox.y0
              items.push({ str: w.text, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, width: w.bbox.x1 - w.bbox.x0, height: h, fontSize: h })
              charCount += w.text.length
            }
          }
        }
      }
      lines.push(...groupIntoLines(items, p))
    }
  } finally {
    await worker.terminate()
  }
  return { totalPages: total, lines, charCount, method: 'ocr' }
}
