import { DAILY_MAX_AGE_MS, type MetricValue, type OnchainSignal } from './types';
export function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function freshMetric(metric: MetricValue | undefined, now: Date, maxAge = DAILY_MAX_AGE_MS): number | null {
  if (!metric || metric.value === null || !Number.isFinite(metric.value)) return null;
  const age = now.getTime() - Date.parse(metric.observed_at);
  return Number.isFinite(age) && age >= 0 && age <= maxAge ? metric.value : null;
}
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function analyzeOnchain(metrics: Record<string, MetricValue>, now = new Date()) {
  const signals: OnchainSignal[] = [];
  const mvrv = freshMetric(metrics.mvrv, now);
  signals.push({ key: 'valuation', label: '가치평가', score: mvrv !== null && mvrv > 0 ? clamp(75 - (mvrv - 1) * 25) : null,
    reason: mvrv !== null && mvrv > 0 ? `MVRV ${mvrv.toFixed(2)} · 실현가치 대비 시가총액 비율; Z-Score와 다름` : '최신 MVRV 데이터 없음' });
  const flow = freshMetric(metrics.exchange_netflow_btc, now);
  const reserves = freshMetric(metrics.exchange_balance_btc, now);
  signals.push({ key: 'exchange', label: '거래소 흐름', score: flow !== null && reserves !== null && reserves > 0 ? clamp(50 - flow / reserves * 5000) : null,
    reason: flow !== null && reserves !== null && reserves > 0 ? `일간 순유입 ${flow.toFixed(0)} BTC · 공급자 식별 거래소 범위; 내부 이동/라벨 오차 가능` : '최신 거래소 흐름·보유량 데이터 없음' });
  const growth = freshMetric(metrics.active_addresses_change_7d_pct, now);
  signals.push({ key: 'activity', label: '네트워크 활동', score: growth !== null ? clamp(50 + growth * .5) : null,
    reason: growth !== null ? `활성 주소 7일 평균 / 이전 7일 평균 ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% · 주소 수는 사용자 수가 아님` : '활성 주소 14일 비교 표본 부족' });
  const usable = signals.filter((s): s is OnchainSignal & { score: number } => s.score !== null);
  const score = usable.length ? Math.round(usable.reduce((s, x) => s + x.score, 0) / usable.length * 100) / 100 : null;
  // Coverage, not a calibrated probability. Never infer direction from fees/hashrate alone.
  const confidence = Math.round(usable.length / signals.length * 60);
  return { onchain_score: score, onchain_confidence: confidence,
    direction: score !== null && score >= 57 ? 'bullish' as const : score !== null && score <= 43 ? 'bearish' as const : 'neutral' as const, signals };
}
