export const DEFAULT_NEWS_INTERVAL_MINUTES = 10;
export const MIN_NEWS_INTERVAL_MINUTES = 5;
export const MAX_NEWS_INTERVAL_MINUTES = 60;

export function resolveNewsIntervalMinutes(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_NEWS_INTERVAL_MINUTES;
  return Math.max(MIN_NEWS_INTERVAL_MINUTES, Math.min(MAX_NEWS_INTERVAL_MINUTES, Math.round(parsed)));
}

export function shouldRunNewsCycle(params: {
  initial: boolean;
  now: number;
  lastRunAt: number;
  intervalMinutes: number;
}): boolean {
  if (params.initial) return true;
  if (params.lastRunAt <= 0) return true;
  return params.now - params.lastRunAt >= params.intervalMinutes * 60_000;
}
