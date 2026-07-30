import { calculateMarketScore } from "./market-score";
import { buildMarketSummary } from "./market-summary";
import {
  loadLatestMarketComponents,
  saveMarketIntelligence,
} from "./repository";
import type { MarketIntelligenceResult } from "./types";

export async function generateMarketIntelligence(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<MarketIntelligenceResult> {
  const now = options?.now ?? new Date();
  const calculatedAt = now.toISOString();

  console.log("[Market Intelligence v2.1] 최신 지표 조회 시작");
  const allComponents = await loadLatestMarketComponents(now);

  for (const component of allComponents) {
    console.log(
      `[Market Intelligence v2.1] ${component.name}: score=${component.score}, confidence=${component.confidence}, age=${component.ageHours}h, freshness=${component.freshnessFactor.toFixed(2)}, fresh=${component.isFresh}`,
    );
  }

  const core = calculateMarketScore(allComponents, calculatedAt);
  const narrative = buildMarketSummary(core);
  const result: MarketIntelligenceResult = {
    ...core,
    ...narrative,
  };

  if (options?.dryRun) {
    console.log("[Market Intelligence v2.1] DRY RUN - DB 저장 생략");
  } else {
    const id = await saveMarketIntelligence(result);
    console.log(`[Market Intelligence v2.1] 저장 완료 (ID ${id})`);
  }

  console.log("[Market Intelligence v2.1] 결과", {
    score: result.score,
    rawScore: result.rawScore,
    consensusAdjustment: result.consensusAdjustment,
    confidence: result.confidence,
    direction: result.direction,
    signal: result.signal,
    riskLevel: result.riskLevel,
    consensusStrength: result.consensusStrength,
    conflictLevel: result.conflictLevel,
    directionVotes: result.directionVotes,
    summary: result.summary,
  });

  return result;
}
