import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createExecutor } from './postgres.mjs';

// Bind to loopback. A user-configured TLS reverse proxy is the only public entry point.
export function createApiServer({ pool, token, jobToken, etfJob, requestsPerMinute = 240, maxConcurrent = 8 }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('API token must contain at least 32 characters');
  const expected = Buffer.from(`Bearer ${token}`);
  if (jobToken && (jobToken.length < 32 || jobToken === token)) throw new Error('Job token must be a separate secret of at least 32 characters');
  const execute = createExecutor(pool, { readOnly: true, maxRows: 5000 });
  let windowStart = Date.now(), requests = 0, active = 0;
  const server = createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
    const isJob = req.url === '/v1/jobs/etf';
    const credential = isJob && jobToken ? Buffer.from(`Bearer ${jobToken}`) : expected;
    const actual = Buffer.from(req.headers.authorization ?? '');
    if (actual.length !== credential.length || !timingSafeEqual(actual, credential)) return reply(401, { error: 'Unauthorized' });
    if (req.method !== 'POST' || (!isJob && req.url !== '/v1/query') || (isJob && (!jobToken || !etfJob))) return reply(404, { error: 'Not found' });
    if (Date.now() - windowStart > 60000) { windowStart = Date.now(); requests = 0; }
    if (++requests > requestsPerMinute || active >= maxConcurrent) return reply(429, { error: 'Too many requests' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return reply(415, { error: 'JSON required' });
    active++;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 128 * 1024) { reply(413, { error: 'Request too large' }); req.resume(); return; }
        chunks.push(chunk);
      }
      const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (isJob) {
        // A fixed capability, never caller-selected functions or SQL writes.
        const result = await etfJob();
        return reply(200, result);
      }
      if (!request || request.operation !== 'select') return reply(403, { error: 'Read-only API' });
      const result = await execute(request);
      if (result.error) return reply(400, { data: null, error: { message: 'Invalid or unavailable query', code: result.error.code } });
      reply(200, result);
    } catch { if (!res.headersSent) reply(isJob ? 503 : 400, { error: isJob ? 'Job failed' : 'Invalid request' }); }
    finally { active--; }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
