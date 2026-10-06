/** Um trecho de texto em uma linha do PDF, com sua posição horizontal. */
export type Cell = { text: string; x0: number; x1: number }

/** Uma linha visual do relatório (y cresce de cima para baixo). */
export type Line = { page: number; y: number; cells: Cell[] }

export type ExtractedDocument = {
  totalPages: number
  lines: Line[]
  /** Quantidade de caracteres úteis encontrados — perto de zero indica PDF escaneado. */
  charCount: number
  method: 'texto' | 'ocr'
}

export type RawInstallment = {
  /** Turma, quando o relatório traz a turma dentro da tabela de parcelas */
  turma?: string
  receita: string
  parcela: string
  vencimento: string // yyyy-mm-dd
  valorParcelaCents: number | null
  descontoCents: number | null
  valorLiquidoCents: number | null
  dataPagamento: string | null
  valorPagoCents: number | null
  linha: string
  avisos: string[]
}

export type RawRecord = {
  aluno: string
  responsavel: string
  cpf: string
  email: string
  celular: string
  turma: string
  matricula: string
  pagina: number
  parcelas: RawInstallment[]
  avisos: string[]
}

export type ParseResult = {
  records: RawRecord[]
  avisos: string[]
  /** linhas que pareciam parcelas mas ficaram fora de qualquer aluno */
  linhasOrfas: number
  totalLinhas: number
}
