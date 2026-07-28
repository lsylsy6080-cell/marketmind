export type NewsSentiment = "bullish" | "neutral" | "bearish";

export interface RuleNewsInput {
  title: string;
  summary: string | null;
  source: string;
  publishedAt: string;
}

export interface RuleNewsAnalysis {
  sentiment: NewsSentiment;
  importance: number;
  aiScore: number;
  aiSummary: string;
  aiReason: string;
  matchedRules: string[];
}

interface KeywordRule {
  id: string;
  label: string;
  patterns: RegExp[];
  scoreDelta: number;
  importanceDelta: number;
}

const RULES: KeywordRule[] = [
  {
    id: "etf_inflow",
    label: "ETF 자금 유입",
    patterns: [
      /\betf\b.*\binflow/i,
      /\binflow\b.*\betf\b/i,
      /record.*\betf\b.*\binflow/i,
    ],
    scoreDelta: 18,
    importanceDelta: 3,
  },
  {
    id: "etf_outflow",
    label: "ETF 자금 유출",
    patterns: [
      /\betf\b.*\boutflow/i,
      /\boutflow\b.*\betf\b/i,
      /\betfs?\b.*\bshed\b/i,
    ],
    scoreDelta: -18,
    importanceDelta: 3,
  },
  {
    id: "institutional_buying",
    label: "기관 매수·비트코인 축적",
    patterns: [
      /\bblackrock\b.*\bbitcoin\b/i,
      /\bstrategy\b.*\bbitcoin\b/i,
      /\btreasury\b.*\bbitcoin\b/i,
      /\bbuy(?:s|ing)?\b.*\bbitcoin\b/i,
      /\baccumulat(?:e|es|ed|ing)\b.*\bbitcoin\b/i,
    ],
    scoreDelta: 12,
    importanceDelta: 2,
  },
  {
    id: "institutional_selling",
    label: "기관 매도·보유량 축소",
    patterns: [
      /\bsell(?:s|ing|off)?\b.*\bbitcoin\b/i,
      /\bdump(?:s|ing|ed)?\b.*\bbitcoin\b/i,
      /\brepay debt\b/i,
      /\btreasury companies sell\b/i,
    ],
    scoreDelta: -14,
    importanceDelta: 2,
  },
  {
    id: "regulatory_approval",
    label: "규제 승인·제도권 채택",
    patterns: [
      /\bapprov(?:e|es|ed|al)\b.*\bbitcoin\b/i,
      /\bbitcoin\b.*\bapprov(?:e|es|ed|al)\b/i,
      /\blegal tender\b/i,
      /\badopt(?:s|ed|ion)?\b.*\bbitcoin\b/i,
    ],
    scoreDelta: 18,
    importanceDelta: 4,
  },
  {
    id: "regulatory_crackdown",
    label: "규제 압박·서비스 차단",
    patterns: [
      /\bban(?:s|ned)?\b.*\bbitcoin\b/i,
      /\bcrackdown\b/i,
      /\btakedown\b/i,
      /\brestrict(?:s|ed|ion)?\b/i,
      /\blawsuit\b/i,
    ],
    scoreDelta: -14,
    importanceDelta: 3,
  },
  {
    id: "bankruptcy",
    label: "파산·재무 위험",
    patterns: [
      /\bbankrupt(?:cy)?\b/i,
      /\binsolven(?:t|cy)\b/i,
      /\bfiles for bankruptcy\b/i,
      /\bdefault\b/i,
    ],
    scoreDelta: -22,
    importanceDelta: 4,
  },
  {
    id: "hack_security",
    label: "해킹·보안 사고",
    patterns: [
      /\bhack(?:ed|ing)?\b/i,
      /\bexploit(?:ed)?\b/i,
      /\bstolen\b/i,
      /\bbreach\b/i,
      /\bsecurity incident\b/i,
    ],
    scoreDelta: -24,
    importanceDelta: 4,
  },
  {
    id: "security_improvement",
    label: "보안 강화·기술 개선",
    patterns: [
      /\bquantum[- ]proof\b/i,
      /\bquantum defense\b/i,
      /\bsecurity fund\b/i,
      /\bupgrade\b/i,
    ],
    scoreDelta: 7,
    importanceDelta: 1,
  },
  {
    id: "fed_dovish",
    label: "완화적 통화정책 기대",
    patterns: [
      /\brate cut\b/i,
      /\bfed helps\b/i,
      /\bdovish\b/i,
      /\beasing\b/i,
    ],
    scoreDelta: 12,
    importanceDelta: 3,
  },
  {
    id: "fed_hawkish",
    label: "긴축적 통화정책 우려",
    patterns: [
      /\brate hike\b/i,
      /\bhawkish\b/i,
      /\bhigher for longer\b/i,
      /\btightening\b/i,
    ],
    scoreDelta: -12,
    importanceDelta: 3,
  },
  {
    id: "geopolitical_relief",
    label: "지정학적 긴장 완화",
    patterns: [
      /\bhold fire\b/i,
      /\bceasefire\b/i,
      /\btruce\b/i,
      /\btensions ease\b/i,
    ],
    scoreDelta: 10,
    importanceDelta: 2,
  },
  {
    id: "geopolitical_risk",
    label: "지정학적 긴장 고조",
    patterns: [
      /\bwar\b/i,
      /\battack\b/i,
      /\bconflict\b/i,
      /\btensions spook\b/i,
      /\bmissile\b/i,
    ],
    scoreDelta: -10,
    importanceDelta: 2,
  },
  {
    id: "price_breakout",
    label: "주요 가격대 돌파",
    patterns: [
      /\bback above\b/i,
      /\bbreaks? above\b/i,
      /\bsurges?\b/i,
      /\brall(?:y|ies)\b/i,
      /\bnew high\b/i,
    ],
    scoreDelta: 8,
    importanceDelta: 1,
  },
  {
    id: "price_breakdown",
    label: "가격 급락·주요 지지선 이탈",
    patterns: [
      /\bfalls? below\b/i,
      /\bdrops?\b/i,
      /\bslumps?\b/i,
      /\bcrash(?:es|ed)?\b/i,
      /\bsell[- ]off\b/i,
    ],
    scoreDelta: -8,
    importanceDelta: 1,
  },
  {
    id: "bullish_options",
    label: "옵션시장 강세 신호",
    patterns: [
      /\boptions\b.*\bbullish\b/i,
      /\bbullish\b.*\boptions\b/i,
      /\bcall options\b/i,
    ],
    scoreDelta: 10,
    importanceDelta: 2,
  },
  {
    id: "bear_market",
    label: "약세장 언급",
    patterns: [
      /\bbear market\b/i,
      /\bbearish\b/i,
    ],
    scoreDelta: -8,
    importanceDelta: 1,
  },
  {
    id: "bottom_signal",
    label: "저점 형성 가능성",
    patterns: [
      /\bbottomed\b/i,
      /\bmarket bottom\b/i,
      /\bprice bottom\b/i,
    ],
    scoreDelta: 9,
    importanceDelta: 1,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSummary(input: RuleNewsInput): string {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary ?? "");

  if (!summary) {
    return `${input.source}는 “${title}” 관련 소식을 전했습니다.`;
  }

  const shortSummary =
    summary.length > 180
      ? `${summary.slice(0, 177).trim()}...`
      : summary;

  return shortSummary;
}

function determineSentiment(score: number): NewsSentiment {
  if (score >= 58) {
    return "bullish";
  }

  if (score <= 42) {
    return "bearish";
  }

  return "neutral";
}

export function analyzeNewsByRules(
  input: RuleNewsInput,
): RuleNewsAnalysis {
  const text = `${input.title}\n${input.summary ?? ""}`;
  const matchedRules: string[] = [];

  let score = 50;
  let importance = 2;

  for (const rule of RULES) {
    const matched = rule.patterns.some((pattern) =>
      pattern.test(text),
    );

    if (!matched) {
      continue;
    }

    score += rule.scoreDelta;
    importance += rule.importanceDelta;
    matchedRules.push(rule.label);
  }

  const hasBitcoinKeyword = /\b(bitcoin|btc)\b/i.test(text);

  if (!hasBitcoinKeyword) {
    importance -= 2;
  }

  const sourceBonus =
    input.source === "CoinDesk" || input.source === "Decrypt"
      ? 1
      : 0;

  importance += sourceBonus;

  const finalScore = Math.round(clamp(score, 0, 100) * 100) / 100;
  const finalImportance = Math.round(
    clamp(importance, 1, 10),
  );
  const sentiment = determineSentiment(finalScore);

  const reason =
    matchedRules.length > 0
      ? `감지된 핵심 신호: ${matchedRules.join(", ")}. 규칙 기반 점수는 ${finalScore}점으로 계산됐습니다.`
      : `뚜렷한 호재·악재 키워드가 확인되지 않아 중립에 가까운 ${finalScore}점으로 평가했습니다.`;

  return {
    sentiment,
    importance: finalImportance,
    aiScore: finalScore,
    aiSummary: buildSummary(input),
    aiReason: reason,
    matchedRules,
  };
}
