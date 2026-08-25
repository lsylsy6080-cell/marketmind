import { normalizeNewsText } from "./news-pipeline-utils";

export interface FreeKoreanEditInput {
  source: string;
  title: string;
  summary?: string | null;
  aiSummary?: string | null;
  sentiment?: "bullish" | "neutral" | "bearish" | null;
  importance?: number | null;
  relevanceScore?: number | null;
}

export interface FreeKoreanEditResult {
  title: string;
  summary: string;
  editor: "marketmind-free-korean-editor-v1";
}

const TERMS: Array<[RegExp,string]> = [
  [/\bBitcoin\b/gi,"비트코인"], [/\bBTC\b/g,"BTC"],
  [/\bspot bitcoin ETF(s)?\b/gi,"비트코인 현물 ETF"],
  [/\bETF inflow(s)?\b/gi,"ETF 순유입"], [/\bETF outflow(s)?\b/gi,"ETF 순유출"],
  [/\bSEC\b/g,"미 SEC"], [/\bFederal Reserve\b/gi,"미 연준"], [/\bFed\b/g,"미 연준"],
  [/\binterest rate(s)?\b/gi,"금리"], [/\binflation\b/gi,"인플레이션"],
  [/\bOpen Interest\b/gi,"미결제약정"], [/\bfunding rate(s)?\b/gi,"펀딩비"],
  [/\bliquidation(s)?\b/gi,"청산"], [/\bcrypto market\b/gi,"암호화폐 시장"],
  [/\bcryptocurrency\b/gi,"암호화폐"], [/\bcrypto\b/gi,"암호화폐"],
  [/\binstitutional\b/gi,"기관"], [/\binvestor(s)?\b/gi,"투자자"],
  [/\bexchange(s)?\b/gi,"거래소"], [/\bregulation\b/gi,"규제"],
  [/\bapproval\b/gi,"승인"], [/\bapproved\b/gi,"승인"],
  [/\blaunches\b/gi,"출시"], [/\blaunched\b/gi,"출시"],
  [/\blists\b/gi,"상장"], [/\blisted\b/gi,"상장"],
  [/\bbuy(s|ing)?\b/gi,"매수"], [/\bbought\b/gi,"매수"],
  [/\bsell(s|ing)?\b/gi,"매도"], [/\bsold\b/gi,"매도"],
  [/\binflow(s)?\b/gi,"자금 유입"], [/\boutflow(s)?\b/gi,"자금 유출"],
  [/\brises?\b/gi,"상승"], [/\bsurges?\b/gi,"급등"], [/\bjumps?\b/gi,"상승"],
  [/\bfalls?\b/gi,"하락"], [/\bdrops?\b/gi,"하락"], [/\bslides?\b/gi,"하락"],
  [/\babove\b/gi,"상회"], [/\bbelow\b/gi,"하회"],
  [/\brecord high\b/gi,"사상 최고치"], [/\ball-time high\b/gi,"사상 최고치"],
];

function clean(value:string|null|undefined):string {
  return normalizeNewsText(value ?? "").replace(/\s+/g," ").trim();
}

function translateTerms(value:string):string {
  let output=value;
  for(const [pattern,replacement] of TERMS) output=output.replace(pattern,replacement);
  return output
    .replace(/\s+([,.:;!?])/g,"$1")
    .replace(/\s{2,}/g," ")
    .trim();
}

function formatMoney(value:string):string {
  const m=value.match(/^\$([\d,.]+)\s*(billion|million|bn|m)?$/i);
  if(!m) return value;
  const amount=m[1];
  const unit=(m[2]??"").toLowerCase();
  if(unit==="billion"||unit==="bn") return `${amount}억 달러`.replace(/(\d+(?:\.\d+)?)억 달러/,(_,n)=>`${Number(n)*10}억 달러`);
  if(unit==="million"||unit==="m") return `${amount}백만 달러`;
  return `${amount}달러`;
}

function headlinePatterns(title:string):string|null {
  const t=clean(title);

  let m=t.match(/^Bitcoin\s+(rises|surges|jumps|falls|drops|slides)\s+(above|below)\s+(\$[\d,.]+)(?:\s+as\s+(.+))?$/i);
  if(m){
    const move=/falls|drops|slides/i.test(m[1])?"하락":"상승";
    const boundary=/above/i.test(m[2])?"상회":"하회";
    const reason=m[4]?`… ${translateTerms(m[4])} 영향`:"";
    return `비트코인 ${move}, ${formatMoney(m[3])} ${boundary}${reason}`;
  }

  m=t.match(/^(?:US\s+)?spot Bitcoin ETFs?\s+(?:see|record|post)\s+(.+?)\s+(inflows?|outflows?)(.*)$/i);
  if(m){
    const flow=/outflow/i.test(m[2])?"순유출":"순유입";
    return `미 비트코인 현물 ETF, ${translateTerms(m[1]).trim()} ${flow}${translateTerms(m[3]).trim() ? ` ${translateTerms(m[3]).trim()}` : ""}`;
  }

  m=t.match(/^(.+?)\s+(buys|bought|acquires|acquired)\s+(.+?)\s+Bitcoin(.*)$/i);
  if(m) return `${translateTerms(m[1])}, 비트코인 ${translateTerms(m[3])} 매수${translateTerms(m[4])}`;

  m=t.match(/^SEC\s+(approves|delays|rejects)\s+(.+)$/i);
  if(m){
    const action=/approves/i.test(m[1])?"승인":/delays/i.test(m[1])?"결정 연기":"거부";
    return `미 SEC, ${translateTerms(m[2])} ${action}`;
  }

  m=t.match(/^(Fed|Federal Reserve)\s+(.+)$/i);
  if(m) return `미 연준, ${translateTerms(m[2])}`;

  return null;
}

export function buildFreeKoreanNewsEdit(input:FreeKoreanEditInput):FreeKoreanEditResult {
  const originalTitle=clean(input.title);
  const sourceText=clean(input.aiSummary) || clean(input.summary);
  const patterned=headlinePatterns(originalTitle);
  let title=patterned ?? translateTerms(originalTitle);

  // 완전 번역이 어려운 fallback은 핵심 BTC 문맥을 앞에 붙여 읽기 쉬운 속보형으로 정리.
  const koreanChars=(title.match(/[가-힣]/g)??[]).length;
  if(koreanChars<4){
    title=`비트코인 관련 해외 소식 · ${title}`;
  }
  title=title.slice(0,180);

  const sentiment=input.sentiment==="bullish"?"긍정":
    input.sentiment==="bearish"?"부정":"중립";
  const relevance=Math.max(0,Math.min(100,Math.round(Number(input.relevanceScore??0))));
  const translatedBody=sourceText ? translateTerms(sourceText) : title;

  let summary=`${translatedBody}`;
  const ko=(summary.match(/[가-힣]/g)??[]).length;
  if(ko<8){
    summary=`${title}. ${input.source}가 전한 비트코인 관련 소식이다.`;
  }
  summary=`${summary.slice(0,520)} 시장 영향 평가는 ${sentiment}, BTC 관련도는 ${relevance}%다.`;

  return {
    title,
    summary:summary.slice(0,700),
    editor:"marketmind-free-korean-editor-v1",
  };
}
