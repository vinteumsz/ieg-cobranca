// Banco em memória que imita o subconjunto do cliente Supabase usado pelas rotas de
// exclusão e recálculo (select/update/delete com eq, in, not-in, order, range).
// Inclui as regras de chave estrangeira relevantes do schema:
//  • dispatches → messages: on delete cascade
//  • charges → dispatches.charge_id / messages.charge_id: on delete set null
//  • imports → charges: on delete cascade

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
type Filter = (r: Row) => boolean

const FK: Record<string, { table: string; column: string; action: 'cascade' | 'set null' }[]> = {
  imports: [{ table: 'charges', column: 'import_id', action: 'cascade' }],
  charges: [
    { table: 'dispatches', column: 'charge_id', action: 'set null' },
    { table: 'messages', column: 'charge_id', action: 'set null' },
  ],
  dispatches: [{ table: 'messages', column: 'dispatch_id', action: 'cascade' }],
}

export function createFakeDb(initial: Tables) {
  const tables: Tables = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.map((r) => structuredClone(r))]))
  const calls: { table: string; op: string }[] = []

  function removeRows(table: string, rows: Row[]) {
    const ids = new Set(rows.map((r) => r.id))
    tables[table] = (tables[table] ?? []).filter((r) => !ids.has(r.id))
    for (const fk of FK[table] ?? []) {
      const children = (tables[fk.table] ?? []).filter((c) => ids.has(c[fk.column]))
      if (fk.action === 'cascade') removeRows(fk.table, children)
      else children.forEach((c) => (c[fk.column] = null))
    }
  }

  class Query implements PromiseLike<{ data: unknown; error: null | { message: string }; count?: number | null }> {
    private op: 'select' | 'update' | 'delete' = 'select'
    private payload: Row = {}
    private filters: Filter[] = []
    private orderBy: { col: string; asc: boolean } | null = null
    private window: [number, number] | null = null
    private cols: string[] | null = null
    private returning = false
    private singleMode: 'one' | 'maybe' | null = null
    private wantCount = false

    constructor(private table: string) {}

    select(cols = '*') {
      if (this.op !== 'select') this.returning = true
      this.cols = cols.trim() === '*' ? null : cols.split(',').map((c) => c.trim())
      return this
    }
    update(payload: Row) {
      this.op = 'update'
      this.payload = payload
      return this
    }
    delete(opts?: { count?: string }) {
      this.op = 'delete'
      this.wantCount = !!opts?.count
      return this
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v)
      return this
    }
    in(col: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[col]))
      return this
    }
    not(col: string, op: string, v: string) {
      if (op !== 'in') throw new Error('fake: not só com in')
      const vs = v.replace(/[()]/g, '').split(',')
      this.filters.push((r) => !vs.includes(String(r[col])))
      return this
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy = { col, asc: opts?.ascending !== false }
      return this
    }
    range(a: number, b: number) {
      this.window = [a, b]
      return this
    }
    maybeSingle() {
      this.singleMode = 'maybe'
      return this
    }
    single() {
      this.singleMode = 'one'
      return this
    }

    private run() {
      calls.push({ table: this.table, op: this.op })
      const all = tables[this.table] ?? (tables[this.table] = [])
      let rows = all.filter((r) => this.filters.every((f) => f(r)))
      if (this.op === 'update') {
        rows.forEach((r) => Object.assign(r, structuredClone(this.payload)))
      } else if (this.op === 'delete') {
        const n = rows.length
        removeRows(this.table, rows)
        return { data: null, error: null, count: this.wantCount ? n : null }
      }
      if (this.op === 'update' && !this.returning) return { data: null, error: null }
      if (this.orderBy) {
        const { col, asc } = this.orderBy
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      }
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
      const out = rows.map((r) => structuredClone(this.cols ? Object.fromEntries(this.cols.map((c) => [c, r[c]])) : r))
      if (this.singleMode) return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }

    then<T1, T2>(ok?: ((v: { data: unknown; error: null; count?: number | null }) => T1 | PromiseLike<T1>) | null, bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null) {
      return Promise.resolve()
        .then(() => this.run())
        .then(ok, bad)
    }
  }

  const db = {
    from: (table: string) => new Query(table),
    storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
  }
  return { db, tables, calls }
}
