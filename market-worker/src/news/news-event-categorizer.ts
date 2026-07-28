import type {
  CategorizedNewsArticle,
  NewsEventCategory,
} from "./news-intelligence-types";

interface CategoryRule {
  category: NewsEventCategory;
  patterns: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "etf",
    patterns: [
      /\betf\b/i,
      /\bspot bitcoin fund\b/i,
      /\bIBIT\b/i,
      /\bGBTC\b/i,
      /\bFBTC\b/i,
    ],
  },
  {
    category: "institutional",
    patterns: [
      /\bblackrock\b/i,
      /\bstrategy\b/i,
      /\bmicrostrategy\b/i,
      /\btreasury\b/i,
      /\binstitution(?:al|s)\b/i,
      /\bcorporate\b.*\bbitcoin\b/i,
      /\bsaylor\b/i,
    ],
  },
  {
    category: "regulation",
    patterns: [
      /\bSEC\b/i,
      /\bregulat(?:or|ion|ory)\b/i,
      /\bban(?:ned|s)?\b/i,
      /\blawsuit\b/i,
      /\btakedown\b/i,
      /\blegal tender\b/i,
      /\bclarity act\b/i,
    ],
  },
  {
    category: "macro",
    patterns: [
      /\bfed\b/i,
      /\bfomc\b/i,
      /\brate cut\b/i,
      /\brate hike\b/i,
      /\binflation\b/i,
      /\bcpi\b/i,
      /\bjobs report\b/i,
      /\btreasury yield\b/i,
      /\bdollar\b/i,
      /\bliquidity\b/i,
    ],
  },
  {
    category: "geopolitics",
    patterns: [
      /\biran\b/i,
      /\bisrael\b/i,
      /\brussia\b/i,
      /\bukraine\b/i,
      /\bwar\b/i,
      /\battack\b/i,
      /\bceasefire\b/i,
      /\bgeopolitical\b/i,
      /\btariff\b/i,
    ],
  },
  {
    category: "security",
    patterns: [
      /\bhack(?:ed|ing)?\b/i,
      /\bexploit(?:ed)?\b/i,
      /\bstolen\b/i,
      /\bbreach\b/i,
      /\bquantum\b/i,
      /\bsecurity\b/i,
    ],
  },
  {
    category: "mining",
    patterns: [
      /\bmining\b/i,
      /\bminer(?:s)?\b/i,
      /\bhashrate\b/i,
      /\bdifficulty\b/i,
      /\bmining pool\b/i,
      /\bhalving\b/i,
    ],
  },
  {
    category: "derivatives",
    patterns: [
      /\boptions?\b/i,
      /\bfutures?\b/i,
      /\bfunding rate\b/i,
      /\bopen interest\b/i,
      /\bliquidation\b/i,
      /\bputs?\b/i,
      /\bcalls?\b/i,
    ],
  },
  {
    category: "market_structure",
    patterns: [
      /\bbreakout\b/i,
      /\bbreakdown\b/i,
      /\bsupport\b/i,
      /\bresistance\b/i,
      /\bdeath cross\b/i,
      /\bgolden cross\b/i,
      /\bbottom(?:ed)?\b/i,
      /\bbear market\b/i,
      /\bbull market\b/i,
    ],
  },
  {
    category: "adoption",
    patterns: [
      /\badopt(?:ion|ed|s)?\b/i,
      /\bpayment\b/i,
      /\breserve\b/i,
      /\baccept(?:ed|s)?\b.*\bbitcoin\b/i,
      /\btokeni[sz](?:e|ed|ation)\b/i,
    ],
  },
];

function buildText(
  article: CategorizedNewsArticle,
): string {
  const matchedRules =
    Array.isArray(article.raw_data?.matched_rules)
      ? article.raw_data?.matched_rules.join(" ")
      : "";

  return [
    article.title,
    article.ai_reason ?? "",
    matchedRules,
  ].join("\n");
}

export function categorizeNewsArticle(
  article: CategorizedNewsArticle,
): NewsEventCategory[] {
  const text = buildText(article);
  const categories = CATEGORY_RULES
    .filter((rule) =>
      rule.patterns.some((pattern) =>
        pattern.test(text),
      ),
    )
    .map((rule) => rule.category);

  return categories.length > 0
    ? [...new Set(categories)]
    : ["other"];
}
