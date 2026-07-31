import type { AiDecisionAlignment, AiDecisionFactor, AiDecisionPermission, AiDecisionRisk, AiDecisionSignal, AiDecisionSnapshot, AiDecisionTrend, AiFactorState } from "@/components/project-center/AiDecisionMonitorCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const MAX_HISTORY = 8;

type Row = Record<string, unknown>;
const isObject = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback = 0) => { const n = typeof value === "number" ? value : Number(value); return Number.isFinite(n) ? n : fallback; };
const text = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const pick = (row: Row, ...keys: string[]) => { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key]; return undefined; };
const upper = (value: unknown) => text(value).toUpperCase();
const lower = (value: unknown) => text(value).toLowerCase();

function signal(value: unknown): AiDecisionSignal {
  const v = lower(value); if (["buy", "long", "bullish"].includes(v)) return "LONG"; if (["sell", "short", "bearish"].includes(v)) return "SHORT"; return "WAIT";
}
function trend(value: unknown): AiDecisionTrend { const v = lower(value); return v === "bullish" ? "BULLISH" : v === "bearish" ? "BEARISH" : "NEUTRAL"; }
function risk(value: unknown): AiDecisionRisk { const v = lower(value); return ["low", "safe"].includes(v) ? "LOW" : ["high", "critical", "blocked"].includes(v) ? "HIGH" : "MEDIUM"; }
function permission(value: unknown): AiDecisionPermission { const v = lower(value); return ["allowed", "allow", "yes"].includes(v) ? "ALLOWED" : ["blocked", "denied", "disallowed"].includes(v) ? "BLOCKED" : "CAUTION"; }
function alignment(value: unknown): AiDecisionAlignment { const v = lower(value); return ["aligned", "strong", "full"].includes(v) ? "ALIGNED" : ["conflicted", "conflict", "opposed"].includes(v) ? "CONFLICTED" : "MIXED"; }
function state(score: number): AiFactorState { return score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral"; }

function factor(key: string, label: string, scoreValue: unknown, weightValue: unknown, summary: string): AiDecisionFactor {
  const score = Math.max(0, Math.min(100, num(scoreValue, 50)));
  const rawWeight = num(weightValue, 0);
  const weight = rawWeight > 1 ? rawWeight / 100 : rawWeight;
  return { key, label, score, weight: Math.max(0, Math.min(1, weight)), state: state(score), summary };
}

function normalize(rowValue: unknown, index: number): AiDecisionSnapshot {
  const row = isObject(rowValue) ? rowValue : {};
  const technicalScore = pick(row, "technical_score", "technicalScore");
  const newsScore = pick(row, "news_score", "newsScore");
  const fundingScore = pick(row, "funding_score", "fundingScore");
  const etfScore = pick(row, "etf_score", "etfScore");
  const factors = [
    factor("technical", "기술 분석", technicalScore, pick(row, "technical_weight", "technicalWeight"), `가격·추세·모멘텀 종합 점수 ${num(technicalScore, 50).toFixed(2)}`),
    factor("news", "뉴스 심리", newsScore, pick(row, "news_weight", "newsWeight"), `최근 뉴스의 시장 심리 점수 ${num(newsScore, 50).toFixed(2)}`),
    factor("funding", "펀딩 흐름", fundingScore, pick(row, "funding_weight", "fundingWeight"), `선물 포지션 과열도 점수 ${num(fundingScore, 50).toFixed(2)}`),
  ];
  if (etfScore !== undefined) factors.push(factor("etf", "ETF 자금", etfScore, pick(row, "etf_weight", "etfWeight"), `기관성 ETF 자금 흐름 점수 ${num(etfScore, 50).toFixed(2)}`));

  const action = lower(pick(row, "action", "final_action", "finalAction")) || "wait";
  const finalDirection = pick(row, "direction", "final_direction", "finalDirection");
  const generatedAt = text(pick(row, "created_at", "generated_at", "generatedAt", "calculated_at"), new Date().toISOString());
  return {
    id: text(pick(row, "id"), `decision-${index}-${generatedAt}`),
    symbol: text(pick(row, "symbol"), "BTCUSDT"),
    timeframe: text(pick(row, "timeframe", "interval"), "1m"),
    signal: signal(action || finalDirection),
    action,
    confidence: Math.max(0, Math.min(100, num(pick(row, "final_confidence", "confidence", "finalConfidence")))),
    marketScore: Math.max(0, Math.min(100, num(pick(row, "final_score", "market_score", "score", "finalScore")))),
    trend: trend(finalDirection),
    risk: risk(pick(row, "risk_level", "riskLevel")),
    tradingPermission: permission(pick(row, "trading_permission", "tradingPermission")),
    alignment: alignment(pick(row, "alignment", "signal_alignment", "signalAlignment")),
    summary: text(pick(row, "summary", "reason", "decision_summary", "decisionSummary"), `${upper(action) || "WAIT"} 판단 · 기술·뉴스·펀딩 신호를 동적 가중치로 종합했습니다.`),
    factors,
    generatedAt,
    modelVersion: text(pick(row, "strategy_version", "model_version", "strategyVersion", "modelVersion")) || undefined,
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("final_market_decisions").select("*").order("created_at", { ascending: false }).limit(MAX_HISTORY);
    if (error) throw new Error(error.message);
    const history = (data ?? []).map(normalize);
    return NextResponse.json({ ok: history.length > 0, checkedAt, source: "Supabase · final_market_decisions", current: history[0] ?? null, history }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ ok: false, checkedAt, source: "Supabase · final_market_decisions", current: null, history: [], error: error instanceof Error ? error.message : "AI 판단 데이터를 불러오지 못했습니다." }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
