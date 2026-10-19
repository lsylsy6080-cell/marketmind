import type { Server } from 'node:http';
export function createApiServer(options: { pool: any; token: string; jobToken?: string; etfJob?: () => Promise<unknown>; requestsPerMinute?: number; maxConcurrent?: number }): Server;
