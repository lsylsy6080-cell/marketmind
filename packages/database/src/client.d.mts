export type Row = Record<string, any>;
export type Result<T> = ({ data: T; error: null } | { data: null; error: { message: string; code?: string } }) & { count?: number | null };
export interface Query<T = Row[]> extends PromiseLike<Result<T>> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): Query<T>;
  insert(rows: Row | Row[]): Query<T>;
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): Query<T>;
  update(values: Row): Query<T>;
  delete(): Query<T>;
  eq(column: string, value: unknown): Query<T>;
  neq(column: string, value: unknown): Query<T>;
  gt(column: string, value: unknown): Query<T>;
  gte(column: string, value: unknown): Query<T>;
  lt(column: string, value: unknown): Query<T>;
  lte(column: string, value: unknown): Query<T>;
  in(column: string, value: unknown[]): Query<T>;
  is(column: string, value: null | boolean): Query<T>;
  not(column: string, operator: string, value: unknown): Query<T>;
  contains(column: string, value: unknown): Query<T>;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Query<T>;
  limit(limit: number): Query<T>;
  range(from: number, to: number): Query<T>;
  single(): Query<Row>;
  maybeSingle(): Query<Row | null>;
}
export type DatabaseClient = { from(table: string): Query; rpc(name: string, args?: Row): Promise<Result<Row | boolean | number>> };
export function createQueryClient(execute: (request: Row) => Promise<Result<any>>): DatabaseClient;
export function createHttpClient(options: { url: string; token: string; fetch?: typeof fetch }): DatabaseClient;
