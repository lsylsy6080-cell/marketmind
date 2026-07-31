import type { RiskLevel, SignalAlignment } from "./types";

export const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

export function normalizeRiskLevel(value?: string): RiskLevel {
  if (
    value === "low" ||
    value === "normal" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return "normal";
}

export interface FinalRiskInput {
  technicalRisk: RiskLevel;
  newsRisk: RiskLevel;
  fundingRisk: RiskLevel;
  etfRisk?: RiskLevel;
  etfFreshness?: number;
  conflictScore: number;
  alignment: SignalAlignment;
}

export function determineFinalRisk(input: FinalRiskInput): RiskLevel {
  const risks: RiskLevel[] = [
    input.technicalRisk,
    input.newsRisk,
    input.fundingRisk,
  ];

  if (input.etfRisk) {
    risks.push(input.etfRisk);
  }

  if (risks.some((risk) => RISK_RANK[risk] >= RISK_RANK.critical)) {
    return "critical";
  }

  const hasStaleEtf =
    input.etfFreshness !== undefined &&
    Number.isFinite(input.etfFreshness) &&
    input.etfFreshness < 0.35;

  if (
    risks.some((risk) => RISK_RANK[risk] >= RISK_RANK.high) ||
    input.conflictScore >= 70 ||
    input.alignment === "conflict"
  ) {
    return "high";
  }

  if (
    risks.every((risk) => risk === "low") &&
    input.conflictScore < 20 &&
    input.alignment !== "mixed" &&
    !hasStaleEtf
  ) {
    return "low";
  }

  return "normal";
}


export function calculateRiskScore(input: FinalRiskInput): number {
  const risks: RiskLevel[] = [input.technicalRisk, input.newsRisk, input.fundingRisk];
  if (input.etfRisk) risks.push(input.etfRisk);

  const avgRank = risks.reduce((s,r)=>s+RISK_RANK[r],0)/risks.length;
  let score = (avgRank/3)*100;

  score += Math.min(input.conflictScore,100)*0.2;

  if (input.alignment==="conflict") score += 10;
  else if (input.alignment==="mixed") score += 5;

  if (
    input.etfFreshness !== undefined &&
    Number.isFinite(input.etfFreshness) &&
    input.etfFreshness < 0.35
  ) {
    score += 8;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
