import { runPerformanceWeightAdvisor } from "./PerformanceWeightAdvisor";
import { loadCurrentRegimeAndBaseline, loadPerformanceSamples, saveWeightAdvice } from "./repository";

export async function runWeightAdvisor(): Promise<ReturnType<typeof runPerformanceWeightAdvisor>> {
  const [{ regime, baseline }, samples] = await Promise.all([
    loadCurrentRegimeAndBaseline(),
    loadPerformanceSamples(200),
  ]);
  const result = runPerformanceWeightAdvisor({ regime, baseline, samples });
  if (process.env.WEIGHT_ADVISOR_DRY_RUN !== "true") await saveWeightAdvice(result);
  return result;
}
