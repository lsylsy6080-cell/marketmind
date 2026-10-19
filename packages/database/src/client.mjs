// Runtime-independent query contracts. No credentials or PostgreSQL code in this module.
export class Query {
  constructor(execute, table) {
    this.execute = execute;
    this.request = { table, operation: 'select', columns: '*', filters: [], orders: [] };
  }
  select(columns = '*', options = {}) { this.request.columns = columns; this.request.returning = true; Object.assign(this.request, options); return this; }
  insert(rows) { this.request.operation = 'insert'; this.request.rows = rows; this.request.returning = false; return this; }
  upsert(rows, options = {}) { this.insert(rows); this.request.operation = 'upsert'; this.request.conflict = options.onConflict; this.request.ignoreDuplicates = options.ignoreDuplicates === true; return this; }
  update(values) { this.request.operation = 'update'; this.request.rows = values; this.request.returning = false; return this; }
  delete() { this.request.operation = 'delete'; this.request.returning = false; return this; }
  filter(column, operator, value) { this.request.filters.push({ column, operator, value }); return this; }
  eq(c, v) { return this.filter(c, 'eq', v); }
  neq(c, v) { return this.filter(c, 'neq', v); }
  gt(c, v) { return this.filter(c, 'gt', v); }
  gte(c, v) { return this.filter(c, 'gte', v); }
  lt(c, v) { return this.filter(c, 'lt', v); }
  lte(c, v) { return this.filter(c, 'lte', v); }
  in(c, v) { return this.filter(c, 'in', v); }
  is(c, v) { return this.filter(c, 'is', v); }
  not(c, op, v) { if (op !== 'is' || v !== null) throw new Error('Only not(column, is, null) is supported'); return this.filter(c, 'not_null', null); }
  contains(c, v) { return this.filter(c, 'contains', v); }
  order(column, options = {}) { this.request.orders.push({ column, ascending: options.ascending !== false, nullsFirst: options.nullsFirst === true }); return this; }
  limit(limit) { this.request.limit = limit; return this; }
  range(from, to) { this.request.offset = from; this.request.limit = to - from + 1; return this; }
  single() { this.request.cardinality = 'one'; return this; }
  maybeSingle() { this.request.cardinality = 'optional'; return this; }
  then(resolve, reject) { this.promise ??= Promise.resolve().then(() => this.execute(structuredClone(this.request))); return this.promise.then(resolve, reject); }
}

export function createQueryClient(execute) {
  return {
    from(table) { return new Query(execute, table); },
    rpc(name, args = {}) { return execute({ operation: 'rpc', name, args }); },
  };
}

export function createHttpClient({ url, token, fetch: requestFetch = globalThis.fetch }) {
  const endpoint = new URL('/v1/query', url);
  if (endpoint.protocol !== 'https:') throw new Error('Buddy4 API URL must use HTTPS');
  if (!token || token.length < 32) throw new Error('Buddy4 API token must contain at least 32 characters');
  return createQueryClient(async request => {
    if (request.operation !== 'select') return { data: null, error: { message: 'Dashboard API is read-only', code: 'READ_ONLY' } };
    try {
      const response = await requestFetch(endpoint, {
        method: 'POST', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(request), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return { data: null, error: { message: `Buddy4 API unavailable (${response.status})`, code: String(response.status) } };
      return await response.json();
    } catch { return { data: null, error: { message: 'Buddy4 API connection failed', code: 'NETWORK_ERROR' } }; }
  });
}
