import { normalizeNewsText } from "./news-pipeline-utils";

export type FlashCategory =
  | "price" | "etf" | "regulation" | "macro" | "institution"
  | "exchange" | "mining" | "liquidation" | "security" | "derivatives"
  | "stablecoin" | "whale" | "market" | "other";

export interface NewsFlash {
  headline: string;
  summary: string;
  category: FlashCategory;
  confidence: number;
  extracted: boolean;
  pattern: string;
}

const MONEY = String.raw`\$[\d,.]+(?:\s?(?:million|billion|trillion|m|bn|b))?`;
const PRICE = String.raw`\$[\d,.]+(?:k|K)?`;
const BTC_AMOUNT = String.raw`[\d,.]+\s?(?:BTC|bitcoin)`;

function clean(v:string|null|undefined){ return normalizeNewsText(v ?? ""); }
function compact(v:string){ return v.replace(/\s+/g," ").trim(); }

function subject(text:string){
  const m=text.match(/\b(Strategy|MicroStrategy|BlackRock|Fidelity|Metaplanet|Tesla|Coinbase|Binance|Kraken|OKX|Bybit|Tether|Circle|SEC|Federal Reserve|Fed|Trump|White House)\b/i);
  if(!m) return null;
  const x=m[1];
  if(/^federal reserve$|^fed$/i.test(x)) return "미 연준";
  if(/^sec$/i.test(x)) return "미 SEC";
  if(/^white house$/i.test(x)) return "백악관";
  if(/^trump$/i.test(x)) return "트럼프";
  return x;
}

function category(text:string):FlashCategory{
  if(/\bETF|inflow|outflow\b/i.test(text)) return "etf";
  if(/\bSEC|regulat|law|bill|senate|congress|court|policy|executive order\b/i.test(text)) return "regulation";
  if(/\bFed|Federal Reserve|CPI|PCE|inflation|interest rate|tariff|jobs report|payroll|dollar|yield\b/i.test(text)) return "macro";
  if(/\bliquidat|short squeeze|long squeeze\b/i.test(text)) return "liquidation";
  if(/\boption|options|futures|derivative|open interest|funding rate|basis\b/i.test(text)) return "derivatives";
  if(/\bhack|exploit|stolen|breach|attack\b/i.test(text)) return "security";
  if(/\bminer|mining|hashrate|difficulty\b/i.test(text)) return "mining";
  if(/\bUSDT|USDC|stablecoin|Tether|Circle\b/i.test(text)) return "stablecoin";
  if(/\bwhale|wallet|transfer|moves?|moved|deposits?|withdraws?|withdrawal\b/i.test(text)) return "whale";
  if(/\bexchange|Binance|Coinbase|Kraken|OKX|Bybit\b/i.test(text)) return "exchange";
  if(/\bStrategy|MicroStrategy|BlackRock|Fidelity|Metaplanet|Tesla|treasury|institution\b/i.test(text)) return "institution";
  if(/\bprice|trader|market|Bitcoin|BTC\b/i.test(text)) return "market";
  return "other";
}

function findFirst(text:string, pattern:RegExp):string|null{
  const m=text.match(pattern);
  return m?.[1] ? compact(m[1]) : null;
}

function buildResult(headline:string,summary:string,category:FlashCategory,confidence:number,pattern:string):NewsFlash{
  return {
    headline:headline.slice(0,180),
    summary:summary.slice(0,650),
    category,confidence,extracted:true,pattern,
  };
}


function detectNewsLanguage(text:string):"ko"|"en"|"mixed" {
  const koreanCount=(text.match(/[가-힣]/g) ?? []).length;
  const englishCount=(text.match(/[A-Za-z]/g) ?? []).length;
  if(koreanCount >= 2 && koreanCount >= englishCount * 0.5) return "ko";
  if(englishCount >= 2) return "en";
  return "mixed";
}

function createKoreanBitcoinFlash(title:string):NewsFlash|null {
  const t=clean(title);
  if(!/(비트코인|BTC)/i.test(t)) return null;

  const priceMatch=t.match(/(?:\$|US\$)?\s?\d[\d,.]*(?:\s?(?:만|억|조))?\s?(?:달러|원)?/);
  const price=priceMatch?.[0]?.trim() || null;

  // 복합 이벤트는 핵심 가격 움직임 + 자금 흐름을 함께 표시한다.
  const hasBreakout=/(돌파|상회|넘어서|넘어섰)/.test(t);
  const hasBreakdown=/(하회|이탈|붕괴|밑으로)/.test(t);
  const hasEtfInflow=/ETF/i.test(t) && /(순유입|자금\s*유입|유입\s*확대|유입\s*증가)/.test(t);
  const hasEtfOutflow=/ETF/i.test(t) && /(순유출|자금\s*유출|유출\s*확대|유출\s*증가)/.test(t);

  if(hasBreakout && hasEtfInflow) {
    return buildResult(
      `BTC ${price ? `${price} ` : ""}돌파… ETF 순유입 확대`,
      "비트코인이 주요 가격대를 돌파한 가운데 ETF 자금 순유입 확대가 함께 확인됐다.",
      "etf", 95, "ko_breakout_etf_inflow",
    );
  }

  if(hasBreakdown && hasEtfOutflow) {
    return buildResult(
      `BTC ${price ? `${price} ` : ""}하회… ETF 순유출 확대`,
      "비트코인이 주요 가격대를 하회한 가운데 ETF 자금 순유출 확대가 함께 확인됐다.",
      "etf", 95, "ko_breakdown_etf_outflow",
    );
  }

  if(hasEtfInflow) {
    return buildResult(
      `BTC ETF 순유입 확대${price ? `… ${price}` : ""}`,
      "비트코인 ETF로의 자금 유입 확대 소식이 전해졌다.",
      "etf", 92, "ko_etf_inflow",
    );
  }

  if(hasEtfOutflow) {
    return buildResult(
      `BTC ETF 순유출 확대${price ? `… ${price}` : ""}`,
      "비트코인 ETF에서 자금 유출이 확대됐다는 소식이 전해졌다.",
      "etf", 92, "ko_etf_outflow",
    );
  }

  if(hasBreakout) {
    return buildResult(
      `BTC ${price ? `${price} ` : ""}돌파`,
      "비트코인이 주요 가격대를 돌파했다.",
      "price", 90, "ko_price_breakout",
    );
  }

  if(hasBreakdown) {
    return buildResult(
      `BTC ${price ? `${price} ` : ""}하회`,
      "비트코인이 주요 가격대를 하회했다.",
      "price", 90, "ko_price_breakdown",
    );
  }

  if(/(추가\s*매수|매수|매입)/.test(t) && /(기업|기관|Strategy|스트래티지|메타플래닛|Metaplanet)/i.test(t)) {
    return buildResult(
      `기관·기업 BTC 매수${price ? `… ${price}` : ""}`,
      "기관 또는 기업의 비트코인 매수 소식이 확인됐다.",
      "institution", 88, "ko_institution_buy",
    );
  }

  if(/(청산|강제청산)/.test(t) && /(롱|숏|레버리지)/.test(t)) {
    return buildResult(
      "BTC 레버리지 포지션 청산 확대",
      "비트코인 파생상품 시장에서 레버리지 포지션 청산 움직임이 포착됐다.",
      "liquidation", 88, "ko_liquidation",
    );
  }

  if(/(국채금리|금리|연준|파월|FOMC|물가|CPI|고용)/i.test(t)) {
    return buildResult(
      `BTC 거시 변수 주시… ${t.slice(0,72)}`,
      "금리·물가·고용 등 거시경제 변수가 비트코인 시장 변수로 부각됐다.",
      "macro", 82, "ko_macro",
    );
  }

  if(/(규제|법안|금융위|금융위원회|SEC|승인|금지|제재)/i.test(t)) {
    return buildResult(
      `BTC 규제 이슈… ${t.slice(0,72)}`,
      "비트코인 관련 규제·정책 변화가 시장 변수로 부각됐다.",
      "regulation", 84, "ko_regulation",
    );
  }

  if(/(해킹|보안|취약점|탈취|유출)/.test(t)) {
    return buildResult(
      `BTC 생태계 보안 이슈… ${t.slice(0,68)}`,
      "비트코인 관련 보안 이슈가 확인됐다.",
      "security", 88, "ko_security",
    );
  }

  return null;
}


function isLowInformationHeadline(text:string):boolean {
  const t=clean(text);
  return /^(?:here'?s what happened|what happened in crypto|morning minute|live updates?|five things to know|weekly roundup|daily roundup)/i.test(t)
    || /\bannounces support for \d+ projects?\b/i.test(t)
    || /\breturns? to\b.*\b(?:conference|summit|forum|lugano)\b/i.test(t);
}

function genericEnglishFlash(title:string):NewsFlash|null {
  const t=clean(title);
  if(!/\b(Bitcoin|BTC|bitcoin ETFs?|Strategy|MicroStrategy|Metaplanet)\b/i.test(t)) return null;
  if(isLowInformationHeadline(t)) return null;

  const money=[...t.matchAll(new RegExp(MONEY,"gi"))].map(x=>compact(x[0]));
  const price=[...t.matchAll(new RegExp(PRICE,"gi"))].map(x=>compact(x[0]));
  const btcAmount=[...t.matchAll(/\b([\d,.]+)\s*(?:BTC|bitcoin)\b/gi)].map(x=>`${compact(x[1])} BTC`);

  // 기업/기관 BTC 매수 및 보유량
  let m=t.match(/^([A-Z][A-Za-z0-9 .&'-]{1,50}?)\s+(?:acquires?|buys?|purchases?)\s+([\d,.]+)\s+(?:bitcoin|BTC)/i);
  if(m){
    const subjectName=compact(m[1]);
    const bought=`${compact(m[2])} BTC`;
    const holdings=t.match(/(?:holdings?|holds?)\s+(?:reach(?:es|ed)?\s+)?([\d,.]+)\s*(?:BTC|bitcoin)/i);
    return buildResult(
      `${subjectName}, ${bought} 추가 매수${holdings?`… 총 보유 ${compact(holdings[1])} BTC`:""}`,
      `${subjectName}가 비트코인 ${bought}를 추가 매수했다${holdings?`. 총 보유량은 ${compact(holdings[1])} BTC로 전해졌다`:""}.`,
      "institution",94,"generic_corporate_btc_buy",
    );
  }

  // ETF 자금/규모 변화
  if(/\bETFs?\b/i.test(t) && /\b(grew|growth|inflow|inflows|biggest day|new money|assets?)\b/i.test(t)){
    const issuer=/BlackRock/i.test(t)?"BlackRock":"BTC ETF";
    return buildResult(
      `${issuer}, ETF 자금 유입·규모 확대${money[0]?`… ${money[0]}`:""}`,
      `비트코인 ETF의 자금 흐름 또는 자산 규모 확대가 확인됐다${money.length?`. 기사에서 ${money.slice(0,2).join(", ")} 규모가 언급됐다`:""}.`,
      "etf",88,"generic_etf_growth",
    );
  }

  // 유명 투자자/기관의 BTC 보유 권고
  m=t.match(/^(.{2,50}?)\s+says?\s+investors?\s+should\s+own\b.*\bBitcoin\b/i);
  if(m){
    return buildResult(
      `${compact(m[1])}, 투자자 BTC 보유 권고`,
      `${compact(m[1])}가 투자 포트폴리오에서 비트코인 보유 필요성을 언급했다.`,
      "institution",86,"generic_investor_btc_allocation",
    );
  }

  // 숏 청산과 상승
  if(/\bBitcoin\b/i.test(t) && /\b(best week|rally|roars?|soars?|surges?)\b/i.test(t) && /\b(shortsellers?|shorts?)\b.*\b(wiped out|liquidat)/i.test(t)){
    return buildResult(
      `BTC 강세 지속… 숏 포지션 청산 확대`,
      `비트코인 강세가 이어지는 가운데 숏 포지션 청산이 확대됐다는 분석이 나왔다.`,
      "liquidation",90,"generic_rally_short_liquidation",
    );
  }

  // Jackson Hole / 거시 이벤트
  if(/\bBitcoin|BTC|crypto\b/i.test(t) && /\bJackson Hole\b/i.test(t)){
    const key=price[0];
    return buildResult(
      `BTC ${key?`${key} `:""}주요 구간 시험… 잭슨홀 주시`,
      `잭슨홀 회의를 앞두고 통화정책 기대가 비트코인과 위험자산의 주요 변수로 부각됐다.`,
      "macro",87,"generic_jackson_hole",
    );
  }

  // 규제 호재/법안
  if(/\bBitcoin|BTC|crypto|virtual assets?\b/i.test(t) && /\b(regulatory|regulation|act|bill|policy)\b/i.test(t)){
    const positive=/positive|moves? forward|come build|approval/i.test(t);
    return buildResult(
      `가상자산 규제·정책 변화${positive?"… 우호적 신호":""}`,
      `비트코인·가상자산 관련 규제 또는 정책 변화가 시장 변수로 부각됐다.`,
      "regulation",82,"generic_regulation_policy",
    );
  }

  // BTC와 ETH 상대강도
  if(/\bEther|Ethereum|ETH\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t) && /\b(crushing|outperform|relative|versus|vs\.?)\b/i.test(t)){
    return buildResult(
      `ETH, BTC 대비 상대강세`,
      `이더리움이 비트코인 대비 강한 상대 흐름을 보이고 있다는 분석이 나왔다.`,
      "market",82,"generic_eth_btc_relative_strength",
    );
  }

  // 가격 목표/시험 구간
  if(/\bBitcoin|BTC\b/i.test(t) && /\b(next test|key level|target|towards?|toward)\b/i.test(t) && price[0]){
    return buildResult(
      `BTC 다음 주요 가격대 ${price[0]} 주목`,
      `비트코인의 다음 주요 가격 구간으로 ${price[0]}가 언급됐다.`,
      "market",84,"generic_price_test",
    );
  }

  // 자본시장/재무구조가 BTC 전략의 핵심이라는 기사
  if(/\bStrategy\b/i.test(t) && /\bcapital markets?\b/i.test(t)){
    return buildResult(
      `Strategy BTC 전략, 자본시장 조달 구조가 핵심 변수`,
      `Strategy의 비트코인 전략에서 BTC 가격뿐 아니라 자본시장 접근성과 자금조달 구조가 핵심 변수라는 분석이 나왔다.`,
      "institution",86,"generic_strategy_capital_markets",
    );
  }

  return null;
}

export function createBitcoinFlash(title:string, summary?:string|null):NewsFlash{
  const t=clean(title), body=clean(summary), text=`${t} ${body}`;

  const language=detectNewsLanguage(t);
  if(language==="ko"){
    const koreanFlash=createKoreanBitcoinFlash(t);
    if(koreanFlash) return koreanFlash;
  }

  const cat=category(text);
  const who=subject(t);
  const monies=[...t.matchAll(new RegExp(MONEY,"gi"))].map(x=>x[0]);
  const prices=[...t.matchAll(new RegExp(PRICE,"gi"))].map(x=>x[0]);

  let m=t.match(new RegExp(`Bitcoin.*?(${MONEY}).*?bet.*?(?:above|over)\\s+(${PRICE})`,"i"));
  if(m) return buildResult(
    `BTC 트레이더, ${compact(m[2])} 돌파에 ${compact(m[1])} 베팅`,
    `비트코인 트레이더의 ${compact(m[1])} 규모 포지션이 ${compact(m[2])} 상방 돌파에 베팅한 것으로 전해졌다.`,
    "market",94,"trader_bet",
  );

  if(/\bETF/i.test(t)){
    const flow=/outflow/i.test(t)?"순유출":/inflow/i.test(t)?"순유입":null;
    const amount=monies[0];
    if(flow) return buildResult(
      `미 BTC 현물 ETF, ${amount?`${compact(amount)} `:""}${flow}`,
      `미국 비트코인 현물 ETF에서 ${amount?`${compact(amount)} 규모의 `:""}${flow}이 관측됐다.`,
      "etf",92,"etf_flow",
    );
  }

  if(/\bwhale\b/i.test(t) || /\b(wallet|address)\b/i.test(t)){
    const btc=findFirst(t,new RegExp(`(${BTC_AMOUNT})`,"i"));
    const amount=monies[0];
    const target=findFirst(t,/\bto\s+(Binance|Coinbase|Kraken|OKX|Bybit)\b/i);
    if(/\btransfer|moves?|moved|deposit|withdraw/i.test(t)){
      const action=/withdraw/i.test(t)?"출금":/deposit|to\s+(Binance|Coinbase|Kraken|OKX|Bybit)/i.test(t)?"거래소 이동":"대규모 이동";
      return buildResult(
        `BTC 고래, ${btc??amount??"대규모 자금"} ${action}${target?`… ${target}`:""}`,
        `대형 지갑에서 ${btc??amount??"상당 규모의 비트코인"} 이동이 포착됐다${target?`. 목적지는 ${target}로 확인됐다`:""}.`,
        "whale",88,"whale_transfer",
      );
    }
  }

  if(/\b(open interest|futures|options|derivatives|funding rate)\b/i.test(t)){
    const amount=monies[0];
    if(/\bopen interest\b/i.test(t)) return buildResult(
      `BTC 미결제약정 ${/record|high|surge|rise|jump/i.test(t)?"증가":"변화"}${amount?`… ${compact(amount)}`:""}`,
      `비트코인 파생상품 시장의 미결제약정이 ${/record|high|surge|rise|jump/i.test(t)?"증가세":"변화"}를 보였다.`,
      "derivatives",86,"open_interest",
    );
    if(/\bfunding rate\b/i.test(t)) return buildResult(
      `BTC 펀딩비 ${/negative|falls?|drops?/i.test(t)?"약세":"상승"}… 포지션 쏠림 주시`,
      `비트코인 선물시장의 펀딩비 변화가 나타나며 롱·숏 포지션 쏠림 여부가 주목된다.`,
      "derivatives",83,"funding_rate",
    );
    return buildResult(
      `BTC 파생상품 시장 변동 확대${amount?`… ${compact(amount)}`:""}`,
      `비트코인 선물·옵션 시장에서 포지션 변화가 확대되고 있다.`,
      "derivatives",78,"derivatives_general",
    );
  }

  if(/\bliquidat/i.test(t)){
    const amount=monies[0];
    const side=/short/i.test(t)?"숏":/long/i.test(t)?"롱":"";
    return buildResult(
      `BTC ${side?`${side} `:""}청산 확대${amount?`… ${compact(amount)} 규모`:""}`,
      `비트코인 파생상품 시장에서 ${amount?`${compact(amount)} 규모의 `:""}${side?`${side} 포지션 `:""}청산이 발생했다.`,
      "liquidation",88,"liquidation",
    );
  }

  if(/\b(stablecoin|USDT|USDC|Tether|Circle)\b/i.test(t)){
    const amount=monies[0];
    if(/\bmint|issue|issuance|prints?\b/i.test(t)) return buildResult(
      `${who??"스테이블코인 발행사"}, ${amount?`${compact(amount)} `:""}신규 발행`,
      `스테이블코인 신규 발행이 확인돼 암호화폐 시장 유동성 변화 가능성이 주목된다.`,
      "stablecoin",84,"stablecoin_mint",
    );
    if(/\binflow|flow|supply\b/i.test(t)) return buildResult(
      `스테이블코인 유동성 ${/outflow|drop|fall/i.test(t)?"감소":"증가"}${amount?`… ${compact(amount)}`:""}`,
      `스테이블코인 유동성 변화가 비트코인 시장의 매수 여력에 영향을 줄 수 있는 변수로 부각됐다.`,
      "stablecoin",80,"stablecoin_flow",
    );
  }

  if(who && /\b(buy|buys|bought|purchase|purchases|acquire|acquires|adds?|holdings?|treasury)\b/i.test(t)){
    const btc=findFirst(t,new RegExp(`(${BTC_AMOUNT})`,"i"));
    const amount=monies[0];
    return buildResult(
      `${who}, BTC ${btc??amount?`${compact(btc??amount!)} 규모 `:""}매수·보유 확대`,
      `${who}의 비트코인 매수 또는 보유 확대 관련 소식이 전해졌다.`,
      "institution",87,"institution_buy",
    );
  }

  if(/\bminer|mining|hashrate|difficulty\b/i.test(t)){
    if(/\bdifficulty\b/i.test(t)) return buildResult(
      `BTC 채굴 난이도 ${/fall|drop|decline/i.test(t)?"하락":"상승"}`,
      `비트코인 채굴 난이도 변화가 나타나며 채굴 환경과 네트워크 경쟁 수준이 변하고 있다.`,
      "mining",81,"mining_difficulty",
    );
    if(/\bhashrate\b/i.test(t)) return buildResult(
      `BTC 해시레이트 ${/fall|drop|decline/i.test(t)?"하락":"상승"}`,
      `비트코인 네트워크 해시레이트 변화가 확인됐다.`,
      "mining",81,"hashrate",
    );
  }

  if(/\bhack|exploit|stolen|breach|attack/i.test(t)){
    const amount=monies[0];
    const exchange=findFirst(t,/\b(Binance|Coinbase|Kraken|OKX|Bybit|exchange)\b/i);
    return buildResult(
      `${exchange??"암호화폐 플랫폼"} 보안 사고${amount?`… 피해 ${compact(amount)}`:""}`,
      `${exchange??"암호화폐 관련 서비스"}에서 보안 사고가 보고됐다${amount?`. 알려진 피해 규모는 ${compact(amount)} 수준이다`:""}.`,
      "security",89,"security_incident",
    );
  }

  if(who==="미 SEC"){
    const action=/approv/i.test(t)?"승인":/reject/i.test(t)?"거부":/delay/i.test(t)?"결정 연기":/lawsuit|sues?|charges?/i.test(t)?"법적 조치":"규제 발표";
    return buildResult(
      `미 SEC, BTC·암호화폐 ${action}`,
      `미 SEC의 비트코인 또는 암호화폐 관련 ${action} 소식이 전해졌다.`,
      "regulation",84,"sec_regulation",
    );
  }

  if(who==="트럼프" || who==="백악관"){
    if(/\bcrypto|bitcoin|BTC|digital asset/i.test(t)) return buildResult(
      `${who}, 암호화폐 정책 관련 발언`,
      `${who}의 비트코인·암호화폐 정책 관련 발언이 시장 변수로 부각됐다.`,
      "regulation",80,"us_policy",
    );
  }

  if(who==="미 연준" || /\bCPI|PCE|inflation|jobs report|payroll|interest rate\b/i.test(t)){
    if(/\bCPI|PCE|inflation\b/i.test(t)) return buildResult(
      `미 물가 지표 발표… BTC 변동성 주시`,
      `미국 물가 지표가 발표되며 금리 기대와 비트코인 변동성에 영향을 줄 수 있는 변수로 주목된다.`,
      "macro",82,"inflation_data",
    );
    if(/\bjobs report|payroll\b/i.test(t)) return buildResult(
      `미 고용지표 발표… BTC 시장 영향 주시`,
      `미국 고용지표가 발표되며 연준 금리 기대와 비트코인 시장에 미칠 영향이 주목된다.`,
      "macro",81,"jobs_data",
    );
    const action=/cut|lower/i.test(t)?"금리 인하 신호":/hike|raise/i.test(t)?"금리 인상 신호":/hold|unchanged/i.test(t)?"금리 동결":"통화정책 발언";
    return buildResult(
      `미 연준, ${action}… BTC 영향 주시`,
      `미 연준의 ${action}가 비트코인을 포함한 위험자산 시장 변수로 부각됐다.`,
      "macro",80,"fed_policy",
    );
  }

  if(/\b(Binance|Coinbase|Kraken|OKX|Bybit)\b/i.test(t)){
    const exchange=findFirst(t,/\b(Binance|Coinbase|Kraken|OKX|Bybit)\b/i) ?? "거래소";
    if(/\blist|listing\b/i.test(t)) return buildResult(
      `${exchange}, 신규 자산 상장 발표`,
      `${exchange}가 신규 자산 상장 관련 내용을 발표했다.`,
      "exchange",76,"exchange_listing",
    );
    if(/\bdeposit|withdrawal|outage|halt|suspend/i.test(t)) return buildResult(
      `${exchange}, 입출금·서비스 상태 변경`,
      `${exchange}의 입출금 또는 서비스 운영 상태 변경 소식이 전해졌다.`,
      "exchange",78,"exchange_status",
    );
  }

  if(/\bBitcoin\b.*\b(?:climbs?|rises?|gains?|holds?)\b.*\b(?:while|as)\b.*\b(?:majors?|altcoins?|crypto)\b.*\b(?:slip|fall|drop|lag|weaken)/i.test(t)){
    const key=prices[0];
    return buildResult(
      `BTC 상대강세${key?`… ${compact(key)} 상회`:""} · 주요 알트 약세`,
      `비트코인이 주요 알트코인 대비 강한 흐름을 보이며 시장 내 상대강도가 확대됐다.`,
      "market",84,"btc_relative_strength",
    );
  }

  const dir =
    /\b(surge|surges|rally|rallies|rise|rises|jump|jumps|gain|gains|breaks? above|tops?|rebound|recovery)\b/i.test(t) ? "상승" :
    /\b(drop|drops|fall|falls|slide|slides|plunge|plunges|breaks? below|sell-?off|decline|declines)\b/i.test(t) ? "하락" : null;

  if(dir && prices.length){
    return buildResult(
      `BTC ${dir}, ${compact(prices[0])} 가격대 주목`,
      `비트코인 가격이 ${dir} 흐름을 보이며 ${compact(prices[0])} 구간이 주요 관찰 가격대로 언급됐다.`,
      "price",79,"price_move",
    );
  }

  if(/\bforecast|predict|target|expects?|could reach|may reach\b/i.test(t) && prices.length){
    return buildResult(
      `BTC 전망, ${compact(prices[0])} 목표가 제시`,
      `시장 참여자 또는 분석가가 비트코인 가격 목표로 ${compact(prices[0])} 수준을 제시했다.`,
      "market",72,"price_forecast",
    );
  }


  // ===== V2.3: 실제 미일치 기사 기반 패턴 =====

  if(/\b(bear market|bull market|out of its bear market|new bull market)\b/i.test(t)){
    const state=/out of its bear market/i.test(t)?"약세장 종료 가능성":
      /new bull market/i.test(t)?"새 강세장 초기 국면":
      /bull market/i.test(t)?"강세장 전망":"약세장 진단";
    const key=prices[0];
    return buildResult(
      `BTC ${state}${key?`… ${compact(key)} 주요 분기점`:""}`,
      `시장 분석에서 비트코인의 ${state} 가능성이 제기됐다${key?`. ${compact(key)} 가격대가 핵심 분기점으로 언급됐다`:""}.`,
      "market",84,"market_cycle",
    );
  }

  if(/\b(breakout|oversold|RSI|bullish divergence|technical analysis|key level|pullback)\b/i.test(t)){
    const key=prices[0];
    const phrase=/bullish divergence/i.test(t)?"RSI 상승 다이버전스":
      /breakout/i.test(t)?"돌파 가능성":
      /oversold/i.test(t)?"과매도 해소":
      /pullback/i.test(t)?"조정 구간":
      /key level/i.test(t)?"핵심 가격대":"기술적 신호";
    return buildResult(
      `BTC ${phrase}${key?`… ${compact(key)} 주목`:""}`,
      `비트코인 기술적 분석에서 ${phrase}가 언급됐다${key?`. ${compact(key)} 가격대가 주요 관찰 구간으로 제시됐다`:""}.`,
      "market",82,"technical_outlook",
    );
  }

  if(/\b(extends?|advance|rally|rallies|outperform|outrunning)\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const pct=t.match(/(?:roughly|about|around)?\s*([\d.]+%)\b/i)?.[1];
    return buildResult(
      `BTC 상승세 지속${pct?`… 최근 ${pct} 상승`:""}`,
      `비트코인이 최근 상승 흐름을 이어가며 시장 대비 강한 움직임을 보이고 있다.`,
      "market",80,"rally_continuation",
    );
  }

  if(/\b(gold|bond yields?|treasury yields?|dollar)\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const factor=/gold/i.test(t)?"금 가격":/bond yields?|treasury yields?/i.test(t)?"미 국채금리":"달러";
    const btcMove=/slips?|falls?|drops?/i.test(t)?"하락":/rally|rises?|gains?/i.test(t)?"상승":"변동";
    const key=prices[0];
    return buildResult(
      `BTC ${btcMove}${key?`… ${compact(key)} 부근`:""} · ${factor} 연동 주시`,
      `${factor} 움직임과 함께 비트코인 가격 변동이 나타나며 거시자산 간 연동성이 주목된다.`,
      "macro",83,"macro_cross_asset",
    );
  }

  if(/\b(tariff|Treasury|quantum|Iran|sanction)\b/i.test(t) && /\bBitcoin|BTC|crypto\b/i.test(t)){
    const topic=/tariff/i.test(t)?"관세":
      /quantum/i.test(t)?"양자컴퓨팅 리스크":
      /Iran/i.test(t)?"이란 관련 정책":
      /sanction/i.test(t)?"제재":"미 재무부 정책";
    return buildResult(
      `BTC·암호화폐 시장, ${topic} 이슈 부각`,
      `${topic} 관련 이슈가 비트코인 및 암호화폐 시장의 정책·리스크 변수로 부각됐다.`,
      "macro",80,"macro_policy_risk",
    );
  }

  if(/\b(draft rules?|rules?|regulation|policy group|parliament|banks?\b.*\bblocking)\b/i.test(t) && /\bBitcoin|BTC|ETF|crypto\b/i.test(t)){
    const region=/Thailand/i.test(t)?"태국":/UK|Britain|British/i.test(t)?"영국":/US|U\.S\./i.test(t)?"미국":"해외";
    if(/\bETF/i.test(t)){
      return buildResult(
        `${region}, BTC·ETH ETF 규정 마련 추진`,
        `${region} 당국이 비트코인·이더리움 ETF 관련 규정 마련 또는 제도 정비를 추진 중이다.`,
        "regulation",85,"etf_rules",
      );
    }
    if(/\bbanks?\b.*\bblocking\b/i.test(t)){
      return buildResult(
        `${region} 은행권, BTC 거래 제한 논란`,
        `${region} 은행권의 비트코인 관련 거래 제한 문제가 정책 당국과 의회에서 논의되고 있다.`,
        "regulation",84,"bank_restriction",
      );
    }
  }

  if(/\b(buys?|bought|purchase|purchased)\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const company=t.match(/^([A-Z][A-Za-z0-9 .&'-]{1,40}?)\s+(?:buys?|bought|purchases?|purchased)\b/i)?.[1]?.trim()
      ?? who ?? "기업";
    const btc=findFirst(t,new RegExp(`(${BTC_AMOUNT})`,"i"));
    const amount=monies[0];
    return buildResult(
      `${company}, BTC ${btc??amount?`${compact(btc??amount!)} 규모 `:""}매수`,
      `${company}가 비트코인 매수를 진행하며 보유량을 확대했다.`,
      "institution",90,"company_btc_buy",
    );
  }

  if(/\b(stock soars?|shares? (?:rise|surge|jump)|shareholders?)\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const company=t.match(/^([A-Z][A-Za-z0-9 .&'-]{1,40}?)(?:\s+Stock|\s+shares?)/)?.[1]?.trim() ?? who ?? "기업";
    return buildResult(
      `${company} 주가 급등… BTC 전략 영향`,
      `${company}의 비트코인 매수·보유 전략과 관련해 주가 변동이 확대됐다.`,
      "institution",78,"btc_company_stock",
    );
  }

  if(/\b(lending|credit line|loan|backed credit)\b/i.test(t) && /\bBTC|Bitcoin\b/i.test(t)){
    const firm=who ?? t.match(/^([A-Z][A-Za-z0-9 .&'-]{1,30})\s+/)?.[1] ?? "암호화폐 업체";
    return buildResult(
      `${firm}, BTC 담보 대출 서비스 확대`,
      `${firm}가 비트코인 등 암호화폐 담보 기반 대출·크레딧 서비스를 확대했다.`,
      "market",76,"crypto_lending",
    );
  }

  if(/\b(human rights|foundation|projects?|support)\b/i.test(t) && /\bBitcoin\b/i.test(t)){
    return buildResult(
      `비트코인 생태계 지원 프로젝트 확대`,
      `비트코인 관련 재단·단체가 생태계 및 인권·개발 프로젝트 지원 확대를 발표했다.`,
      "market",68,"ecosystem_support",
    );
  }

  if(/\b(vote against the dollar|against the dollar)\b/i.test(t) && /\bBitcoin\b/i.test(t)){
    return buildResult(
      `BTC 랠리, 달러 약세 베팅 성격 부각`,
      `비트코인 상승세가 달러 가치와 미국 통화정책에 대한 시장의 시각을 반영한다는 분석이 제기됐다.`,
      "macro",78,"dollar_narrative",
    );
  }

  if(/\b(privacy flaw|privacy|Zcash ETF)\b/i.test(t) && /\bETF|crypto\b/i.test(t)){
    return buildResult(
      `암호화폐 ETF·프라이버시 이슈 부각`,
      `암호화폐 ETF와 프라이버시 기술 관련 이슈가 시장의 주요 논점으로 부각됐다.`,
      "etf",68,"alt_etf_privacy",
    );
  }


  // ===== V2.4: 2026-08-26 실데이터 기반 보강 =====

  if(/\b(rising|surging|higher|falling)\s+(?:US\s+)?(?:bond\s+)?yields?\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const key=prices[0];
    const oil=/\boil\b/i.test(t);
    const state=/pauses?|holds?|flat|steady/i.test(t)?"보합":
      /climbs?|rises?|gains?/i.test(t)?"상승":
      /falls?|drops?|slips?/i.test(t)?"하락":"변동";
    return buildResult(
      `BTC ${state}${key?`… ${compact(key)} 부근`:""} · 미 국채금리${oil?"·유가":""} 주시`,
      `미 국채금리${oil?"와 유가":""} 움직임이 위험자산 심리에 영향을 주는 가운데 비트코인 가격 흐름이 주목된다.`,
      "macro",86,"yield_oil_risk_appetite",
    );
  }

  if(/\bS&P\s*500\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const btcPct=t.match(/Bitcoin[^%]{0,60}?([\d.]+%)/i)?.[1];
    const spPct=t.match(/S&P\s*500[^%]{0,60}?([\d.]+%)/i)?.[1];
    return buildResult(
      `BTC, S&P500 대비 상대강도 우위${btcPct?`… ${btcPct}`:""}`,
      `비트코인이 S&P500보다 강한 상대 수익률을 기록했다${btcPct?`. BTC 변동률은 ${btcPct}`:""}${spPct?`, S&P500은 ${spPct} 수준으로 언급됐다`:""}.`,
      "market",86,"btc_vs_sp500",
    );
  }

  if(/\b(leveraged bulls?|leveraged longs?|bulls?)\b.*\b(whacked|liquidat|wiped out|at risk)\b/i.test(t) && /\bBitcoin|BTC\b/i.test(t)){
    const key=prices[0];
    return buildResult(
      `BTC 레버리지 롱 청산 위험 구간${key?`… ${compact(key)} 주목`:""} `,
      `비트코인 레버리지 롱 포지션의 청산 위험 가격대가 시장의 주요 리스크 구간으로 언급됐다.`,
      "liquidation",88,"leveraged_long_risk",
    );
  }

  if(/\bStrategy\b/i.test(t) && /\b(cash reserve|share buyback|buyback)\b/i.test(t)){
    const amount=monies[0];
    return buildResult(
      `Strategy, ${amount?`${compact(amount)} `:""}현금 비축 확대… 자사주 매입은 후순위`,
      `Strategy가 현금 비축을 확대하는 가운데 자사주 매입은 현재 우선순위가 아니라는 입장을 밝혔다.`,
      "institution",88,"strategy_cash_reserve",
    );
  }

  if(/\bStrategy\b/i.test(t) && /\b(raises?|raised|selling|sells?)\b.*\bMSTR\b/i.test(t)){
    const amount=monies[0];
    return buildResult(
      `Strategy, MSTR 매각으로 ${amount?`${compact(amount)} `:""}자금 조달… BTC 보유 유지`,
      `Strategy가 MSTR 주식 매각을 통해 자금을 조달하면서 기존 비트코인 보유량은 유지한 것으로 전해졌다.`,
      "institution",90,"strategy_equity_raise",
    );
  }

  if(/\b(Strategy|MicroStrategy)\b.*\bMetaplanet\b/i.test(t) && /\b(holder|holders|holding|holdings|betting|treasury)\b/i.test(t)){
    return buildResult(
      `Strategy·Metaplanet, BTC 보유전략 지속`,
      `대형 비트코인 보유 기업인 Strategy와 Metaplanet의 재무·보유 전략이 가격 전망보다 자본구조와 장기 보유 논리에 초점을 맞추고 있다는 분석이 나왔다.`,
      "institution",84,"treasury_holders_strategy",
    );
  }

  if(/\bBinance\b/i.test(t) && /\b(user data|customer data|personal data|data)\b/i.test(t) && /\b(Russia|Russian|arrest|authorit)/i.test(t)){
    return buildResult(
      `Binance, 이용자 정보 제공 논란… 규제·프라이버시 이슈`,
      `Binance의 이용자 정보 제공과 관련해 규제 준수 및 개인정보 보호 문제가 다시 부각됐다.`,
      "regulation",89,"exchange_user_data",
    );
  }

  if(new RegExp(`\\bBitcoin\\b.*\\b(?:holds?|stays?|remains?)\\b.*?(${PRICE})`,"i").test(t) && /\b(?:live updates?|risk appetite|equities?|stocks?)\b/i.test(t)){
    const key=prices[0];
    return buildResult(
      `BTC ${key?`${compact(key)} 부근 유지`:"보합"}… 위험자산 심리 주시`,
      `비트코인이 주요 가격대를 유지하는 가운데 주식시장과 위험선호 변화가 단기 변수로 부각됐다.`,
      "macro",80,"btc_risk_appetite",
    );
  }

  const generic=genericEnglishFlash(t);
  if(generic) return generic;

  return {
    headline:`[원문] ${t}`.slice(0,180),
    summary:"자동 속보 패턴으로 핵심 사실을 충분히 추출하지 못해 원문 제목을 유지했습니다.",
    category:cat,
    confidence:35,
    extracted:false,
    pattern:"fallback",
  };
}
