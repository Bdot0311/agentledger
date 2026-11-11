/**
 * Minimal in-memory stand-in for the subset of the supabase-js query builder
 * used by lib/facts.ts and lib/ingest.ts. Not a general fake.
 */
type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> {
  private filters: ((r: Row) => boolean)[] = [];
  private sort: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private single = false;
  private pendingInsert: Row[] | null = null;
  private ignoreDup = false;
  private conflictCols: string[] = [];

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select() {
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sort = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.pendingInsert = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.pendingInsert = Array.isArray(rows) ? rows : [rows];
    this.ignoreDup = Boolean(opts?.ignoreDuplicates);
    this.conflictCols = opts?.onConflict?.split(",") ?? [];
    return this;
  }

  private run() {
    const table = (this.db.tables[this.table] ??= []);
    if (this.pendingInsert) {
      const inserted: Row[] = [];
      for (const r of this.pendingInsert) {
        const uniq = this.db.unique[this.table] ?? [];
        const keys = this.conflictCols.length ? [this.conflictCols, ...uniq] : uniq;
        const clash = keys.some((cols) => table.some((t) => cols.every((c) => t[c] === r[c] && r[c] != null)));
        if (clash) {
          if (this.ignoreDup) continue;
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row = { id: `${this.table}-${table.length + 1}`, created_at: new Date().toISOString(), ...r };
        table.push(row);
        inserted.push(row);
      }
      return { data: inserted, error: null };
    }
    let rows = table.filter((r) => this.filters.every((f) => f(r)));
    if (this.sort) {
      const { col, asc } = this.sort;
      rows = [...rows].sort((a, b) => ((a[col] as number) > (b[col] as number) ? 1 : -1) * (asc ? 1 : -1));
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    return { data: this.single ? (rows[0] ?? null) : rows, error: null };
  }

  then<A, B>(onF?: ((v: ReturnType<Query["run"]>) => A | PromiseLike<A>) | null, onR?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(onF, onR);
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  constructor(public unique: Record<string, string[][]> = {}) {}
  from(table: string) {
    return new Query(this, table);
  }
}

export const fakeDb = () =>
  new FakeDb({ fact_sheets: [["workspace_id", "version"]], messages: [["workspace_id", "source", "external_id"]] });
