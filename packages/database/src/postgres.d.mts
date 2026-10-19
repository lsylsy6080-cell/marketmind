import type { DatabaseClient } from './client.mjs';
export function createPostgresClient(options?: { pool?: any; connectionString?: string; readOnly?: boolean }): DatabaseClient & { pool: any; close(): Promise<void> };
export function createExecutor(pool: any, options?: { readOnly?: boolean; maxRows?: number }): (request: any) => Promise<any>;
