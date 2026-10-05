// Extração do texto do PDF com posições. Roda no navegador (tela de importação)
// e no Node (testes). O PDF não precisa sair do computador do funcionário.
import { extractTextItems, getDocumentProxy } from 'unpdf'
import { groupIntoLines } from './lines'
import type { ExtractedDocument, Line } from './types'

export async function extractDocument(data: Uint8Array): Promise<ExtractedDocument> {
  // unpdf/pdf.js "consome" o buffer; usamos uma cópia
  const pdf = await getDocumentProxy(new Uint8Array(data))
  const { totalPages, items } = await extractTextItems(pdf)
  const lines: Line[] = []
  let charCount = 0
  items.forEach((pageItems, idx) => {
    const positioned = pageItems.map((it) => ({
      str: it.str,
      x: it.x,
      y: -it.y, // PDF cresce de baixo para cima; invertemos
      width: it.width,
      height: it.height,
      fontSize: it.fontSize,
    }))
    charCount += pageItems.reduce((n, it) => n + it.str.replace(/\s/g, '').length, 0)
    lines.push(...groupIntoLines(positioned, idx + 1))
  })
  return { totalPages, lines, charCount, method: 'texto' }
}

/** PDF provavelmente escaneado (imagem): pouquíssimo texto por página. */
export function looksScanned(doc: ExtractedDocument): boolean {
  return doc.charCount < Math.max(40, doc.totalPages * 25)
}
