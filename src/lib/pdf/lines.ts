import type { Cell, Line } from './types'

export type PositionedText = { str: string; x: number; y: number; width: number; height: number; fontSize: number }

/**
 * Agrupa trechos posicionados em linhas e células.
 * `y` deve crescer de cima para baixo.
 */
export function groupIntoLines(items: PositionedText[], page: number): Line[] {
  const usable = items.filter((i) => i.str && i.str.trim().length > 0)
  usable.sort((a, b) => a.y - b.y || a.x - b.x)

  const rows: { y: number; size: number; items: PositionedText[] }[] = []
  for (const it of usable) {
    const size = it.fontSize || it.height || 8
    const tol = Math.max(2, size * 0.45)
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol)
    if (row) row.items.push(it)
    else rows.push({ y: it.y, size, items: [it] })
  }
  rows.sort((a, b) => a.y - b.y)

  return rows.map((row) => {
    const sorted = [...row.items].sort((a, b) => a.x - b.x)
    const cells: Cell[] = []
    for (const it of sorted) {
      const text = it.str.replace(/\s+/g, ' ')
      const prev = cells[cells.length - 1]
      const size = it.fontSize || row.size
      if (prev) {
        const gap = it.x - prev.x1
        if (gap < size * 0.8) {
          const needsSpace = gap > size * 0.12 && !prev.text.endsWith(' ') && !text.startsWith(' ')
          prev.text += (needsSpace ? ' ' : '') + text
          prev.x1 = Math.max(prev.x1, it.x + it.width)
          continue
        }
      }
      cells.push({ text, x0: it.x, x1: it.x + it.width })
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim()
    return { page, y: row.y, cells: cells.filter((c) => c.text.length > 0) }
  })
}

export function lineText(line: Line, sep = '  '): string {
  return line.cells.map((c) => c.text).join(sep)
}
