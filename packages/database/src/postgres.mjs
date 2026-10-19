import pg from 'pg';
import { createQueryClient } from './client.mjs';
import { relations, rpcNames } from './registry.mjs';

const identifier = /^[a-z][a-z0-9_]*$/;
function quote(value) {
  if (typeof value !== 'string' || !identifier.test(value)) throw new Error('Invalid SQL identifier');
  return `"${value}"`;
}
function integer(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('Invalid query bounds');
  return value;
}
function projection(value) {
  if (value === '*') return '*';
  if (typeof value !== 'string' || value.length > 12000) throw new Error('Invalid projection');
  return value.split(',').map(part => {
    const match = part.trim().match(/^(?:([a-z][a-z0-9_]*):)?([a-z][a-z0-9_]*)(?:(->>?)([a-z][a-z0-9_]*))?$/);
    if (!match) throw new Error('Unsupported projection');
    const [, alias, column, op, key] = match;
    return quote(column) + (op ? `${op}'${key}'` : '') + (alias ? ` AS ${quote(alias)}` : '');
  }).join(',');
}
function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  return value;
}

export function createExecutor(pool, { readOnly = false, maxRows = 10000 } = {}) {
  return async request => {
    try {
      const values = [];
      const bind = value => { values.push(value); return `$${values.length}`; };
      const operation = request.operation;
      if (readOnly && operation !== 'select') throw new Error('Read-only API');
      if (operation === 'rpc') {
        if (!rpcNames.includes(request.name)) throw new Error('Unknown RPC');
        const args = Object.entries(request.args ?? {}).map(([key, value]) => `${quote(key)} => ${bind(value)}`).join(',');
        const result = await pool.query(`SELECT public.${quote(request.name)}(${args}) AS result`, values);
        return { data: normalize(result.rows[0]?.result ?? null), error: null };
      }
      if (!relations.includes(request.table)) throw new Error('Unknown relation');
      const table = `public.${quote(request.table)}`;
      if (!Array.isArray(request.filters) || request.filters.length > 32 || !Array.isArray(request.orders) || request.orders.length > 8) throw new Error('Invalid query filters');
      const conditions = request.filters.map(({ column, operator, value }) => {
        const col = quote(column);
        if (operator === 'not_null') return `${col} IS NOT NULL`;
        if (operator === 'is') { if (value !== null && typeof value !== 'boolean') throw new Error('Invalid IS operand'); return `${col} IS ${value === null ? 'NULL' : value ? 'TRUE' : 'FALSE'}`; }
        if (operator === 'in') { if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid IN list'); return value.length ? `${col} IN (${value.map(bind).join(',')})` : 'FALSE'; }
        if (operator === 'contains') return `${col} @> ${bind(JSON.stringify(value))}::jsonb`;
        const operators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
        if (!Object.hasOwn(operators, operator)) throw new Error('Unsupported filter');
        return `${col} ${operators[operator]} ${bind(value)}`;
      });
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const columns = projection(request.columns ?? '*');
      const limit = integer(request.limit, maxRows, maxRows);
      const offset = integer(request.offset, 0, 10000000);
      let sql;
      if (operation === 'select') {
        if (request.head) {
          const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}${where}`, values);
          return { data: null, error: null, count: result.rows[0].count };
        }
        const orders = request.orders.map(o => `${quote(o.column)} ${o.ascending === false ? 'DESC' : 'ASC'} NULLS ${o.nullsFirst === true ? 'FIRST' : 'LAST'}`);
        sql = `SELECT ${columns}${request.count === 'exact' ? ',count(*) OVER()::int AS __mm_count' : ''} FROM ${table}${where}${orders.length ? ' ORDER BY ' + orders.join(',') : ''} LIMIT ${bind(limit)} OFFSET ${bind(offset)}`;
      } else if (['insert', 'upsert', 'update'].includes(operation)) {
        const rows = Array.isArray(request.rows) ? request.rows : [request.rows];
        if (!rows.length) return { data: [], error: null };
        if (rows.length > 10000 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid write payload');
        const keys = Object.keys(rows[0]);
        if (!keys.length || rows.some(row => Object.keys(row).length !== keys.length || keys.some(k => !Object.hasOwn(row, k)))) throw new Error('Write rows must have the same keys');
        const fields = keys.map(quote);
        if (operation === 'update') {
          if (rows.length !== 1 || !where) throw new Error('Update requires filters and one payload');
          const payload = bind(JSON.stringify(rows[0]));
          sql = `UPDATE ${table} SET (${fields.join(',')}) = (SELECT ${fields.join(',')} FROM jsonb_populate_record(NULL::${table},${payload}::jsonb))${where}`;
        } else {
          sql = `INSERT INTO ${table} (${fields.join(',')}) SELECT ${fields.join(',')} FROM jsonb_populate_recordset(NULL::${table},${bind(JSON.stringify(rows))}::jsonb)`;
          if (operation === 'upsert') {
            const conflict = request.conflict?.split(',').map(k => k.trim());
            if (!conflict?.length) throw new Error('UPSERT requires explicit conflict keys');
            const updates = keys.filter(k => !conflict.includes(k));
            sql += ` ON CONFLICT (${conflict.map(quote).join(',')}) ` + (request.ignoreDuplicates || !updates.length ? 'DO NOTHING' : `DO UPDATE SET ${updates.map(k => `${quote(k)}=EXCLUDED.${quote(k)}`).join(',')}`);
          }
        }
        if (request.returning) sql += ` RETURNING ${columns}`;
      } else if (operation === 'delete') {
        if (!where) throw new Error('Delete requires filters');
        sql = `DELETE FROM ${table}${where}${request.returning ? ' RETURNING ' + columns : ''}`;
      } else throw new Error('Unsupported operation');
      const result = await pool.query(sql, values);
      const rows = normalize(result.rows);
      const count = request.count === 'exact' ? rows[0]?.__mm_count ?? 0 : null;
      for (const row of rows) delete row.__mm_count;
      if (request.cardinality && (rows.length > 1 || (request.cardinality === 'one' && rows.length !== 1))) return { data: null, error: { message: 'Expected a single row', code: 'PGRST116' } };
      return { data: request.cardinality ? rows[0] ?? null : rows, error: null, count };
    } catch (error) {
      return { data: null, error: { message: error.message, code: error.code ?? 'QUERY_ERROR' } };
    }
  };
}

export function createPostgresClient({ pool, connectionString, readOnly = false } = {}) {
  if (!pool) {
    if (!connectionString && !process.env.DATABASE_URL && !process.env.PGDATABASE) throw new Error('Set DATABASE_URL or PGDATABASE for Buddy4 PostgreSQL');
    // Do not disable TLS certificate validation for remote connections.
    const types = { getTypeParser: oid => oid === 1082 ? value => value : oid === 1700 ? Number : oid === 20 ? value => { const n=Number(value); return Number.isSafeInteger(n)?n:value; } : pg.types.getTypeParser(oid) };
    pool = new pg.Pool({ connectionString: connectionString ?? process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 10000, statement_timeout: 15000, types, ...(readOnly ? { options: '-c default_transaction_read_only=on' } : {}) });
    pool.on('error', () => console.error('[PostgreSQL] idle connection error'));
  }
  return Object.assign(createQueryClient(createExecutor(pool)), { pool, close: () => pool.end() });
}
