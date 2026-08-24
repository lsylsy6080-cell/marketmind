import { runDecisionEngineV2 } from "./DecisionEngineV2";
import { loadDecisionV2Sources, saveDecisionV2 } from "./repository";
import type { DecisionV2Result } from "./types";

export async function runDecisionV2(options?: { dryRun?: boolean; now?: Date }): Promise<DecisionV2Result> {
  const source = await loadDecisionV2Sources();
  const result = runDecisionEngineV2({
    technical: source.technical,
    news: source.news,
    funding: source.funding,
    regime: source.regime,
    previousEntryPlan: source.previousEntryPlan,
    previousEntryPlanCalculatedAt: source.previousEntryPlanCalculatedAt,
    marketStructure: source.marketStructure,
    openInterest: source.openInterest,
    liquidation: source.liquidation,
    squeezeWarning: source.squeezeWarning,
    now: options?.now,
  });

  if (!options?.dryRun) await saveDecisionV2(result, source);
  return result;
}
