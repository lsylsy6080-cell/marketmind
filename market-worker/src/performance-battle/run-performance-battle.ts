import { buildPerformanceBattle } from "./PerformanceBattleEngine";
import { loadBattlePairs, MAX_PAIRING_LAG_MINUTES, savePerformanceBattle } from "./repository";
import type { PerformanceBattleResult } from "./types";

export async function runPerformanceBattle(options?: { dryRun?: boolean }): Promise<PerformanceBattleResult> {
  const loaded = await loadBattlePairs();
  const result = buildPerformanceBattle(loaded.pairs, {
    candidateV2Snapshots: loaded.candidateV2Snapshots,
    excludedLaggedPairs: loaded.excludedLaggedPairs,
    maxPairingLagMinutes: MAX_PAIRING_LAG_MINUTES,
  });
  if (!options?.dryRun) await savePerformanceBattle(result);
  return result;
}
