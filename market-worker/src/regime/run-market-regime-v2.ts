import { aggregateMarketRegime, calculateTimeframeRegimeMetrics, REGIME_TIMEFRAMES } from "./MarketRegimeEngine";
import { loadRegimeCandles, saveMarketRegime } from "./repository";
import type { MarketRegimeResult, TimeframeRegimeMetrics } from "./types";

export async function runMarketRegimeV2(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<MarketRegimeResult> {
  const metrics: TimeframeRegimeMetrics[] = [];
  const failures: string[] = [];

  for (const config of REGIME_TIMEFRAMES) {
    try {
      const candles = await loadRegimeCandles(config.timeframe, 300);
      metrics.push(
        calculateTimeframeRegimeMetrics({
          timeframe: config.timeframe,
          weight: config.weight,
          candles,
        }),
      );
    } catch (error) {
      failures.push(
        `${config.timeframe}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (metrics.length < 4) {
    throw new Error(`[Regime V2] 유효 시간봉 부족 (${metrics.length}/6) · ${failures.join(" | ")}`);
  }

  const result = aggregateMarketRegime(metrics, options?.now ?? new Date());

  if (!options?.dryRun) {
    await saveMarketRegime(result);
  }

  return result;
}
