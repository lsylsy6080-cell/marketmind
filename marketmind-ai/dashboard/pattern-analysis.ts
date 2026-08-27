export type PatternCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PatternDirection = "bullish" | "bearish" | "neutral";
export type PatternStatus = "forming" | "completed";

export type PatternPoint = {
  time: number;
  price: number;
  label?: string;
};

export type DetectedPattern = {
  id: string;
  type:
    | "rising_wedge"
    | "falling_wedge"
    | "inverse_head_shoulders"
    | "head_shoulders"
    | "cup_handle"
    | "double_bottom"
    | "double_top"
    | "ascending_triangle"
    | "descending_triangle";
  name: string;
  direction: PatternDirection;
  status: PatternStatus;
  confidence: number;
  startTime: number;
  endTime: number;
  targetPrice: number | null;
  breakoutPrice: number | null;
  points: PatternPoint[];
  reason: string;
};

export type PatternForecast = {
  patterns: DetectedPattern[];
  primary: DetectedPattern | null;
  bullishProbability: number;
  neutralProbability: number;
  bearishProbability: number;
  confidence: number;
  expected24hTarget: number | null;
  currentPrice: number | null;
  rsi14: number | null;
  ema20: number | null;
  ema60: number | null;
  trend: "bullish" | "bearish" | "neutral";
};

type Pivot = { index: number; time: number; price: number; kind: "high" | "low" };

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const pct=(a:number,b:number)=>b===0?0:Math.abs(a-b)/Math.abs(b);

function ema(candles:PatternCandle[], period:number){
  if(candles.length<period)return null;
  const k=2/(period+1);
  let value=candles[0].close;
  for(let i=1;i<candles.length;i++) value=candles[i].close*k+value*(1-k);
  return value;
}

function rsi(candles:PatternCandle[], period=14){
  if(candles.length<=period)return null;
  let gain=0,loss=0;
  for(let i=candles.length-period;i<candles.length;i++){
    const diff=candles[i].close-candles[i-1].close;
    if(diff>=0)gain+=diff; else loss-=diff;
  }
  const avgGain=gain/period;
  const avgLoss=loss/period;
  if(avgLoss===0)return 100;
  const rs=avgGain/avgLoss;
  return 100-(100/(1+rs));
}

function pivots(candles:PatternCandle[], radius=3):Pivot[]{
  const out:Pivot[]=[];
  for(let i=radius;i<candles.length-radius;i++){
    let isHigh=true,isLow=true;
    for(let j=i-radius;j<=i+radius;j++){
      if(j===i)continue;
      if(candles[j].high>=candles[i].high)isHigh=false;
      if(candles[j].low<=candles[i].low)isLow=false;
    }
    if(isHigh)out.push({index:i,time:candles[i].time,price:candles[i].high,kind:"high"});
    if(isLow)out.push({index:i,time:candles[i].time,price:candles[i].low,kind:"low"});
  }
  return out.sort((a,b)=>a.index-b.index);
}

function regression(points:Pivot[]){
  if(points.length<2)return {slope:0,intercept:0};
  const n=points.length;
  const sx=points.reduce((s,p)=>s+p.index,0);
  const sy=points.reduce((s,p)=>s+p.price,0);
  const sxy=points.reduce((s,p)=>s+p.index*p.price,0);
  const sxx=points.reduce((s,p)=>s+p.index*p.index,0);
  const denom=n*sxx-sx*sx;
  const slope=denom===0?0:(n*sxy-sx*sy)/denom;
  return {slope,intercept:(sy-slope*sx)/n};
}

function point(p:Pivot,label?:string):PatternPoint{
  return {time:p.time,price:p.price,label};
}

function detectHeadShoulders(candles:PatternCandle[], ps:Pivot[]):DetectedPattern[]{
  const out:DetectedPattern[]=[];
  const highs=ps.filter(p=>p.kind==="high").slice(-8);
  const lows=ps.filter(p=>p.kind==="low").slice(-8);

  for(let i=0;i<=highs.length-3;i++){
    const [a,b,c]=highs.slice(i,i+3);
    if(!(a.index<b.index&&b.index<c.index))continue;
    const shouldersClose=pct(a.price,c.price)<=0.025;
    const headHigher=b.price>Math.max(a.price,c.price)*1.025;
    if(!shouldersClose||!headHigher)continue;
    const neckLows=lows.filter(l=>l.index>a.index&&l.index<c.index);
    if(neckLows.length<2)continue;
    const neck=(neckLows[0].price+neckLows[neckLows.length-1].price)/2;
    const last=candles[candles.length-1];
    const completed=last.close<neck;
    const height=b.price-neck;
    out.push({
      id:`hs-${a.time}`,
      type:"head_shoulders",name:"헤드앤숄더",direction:"bearish",
      status:completed?"completed":"forming",
      confidence:clamp(Math.round(68+(headHigher?8:0)+(shouldersClose?8:0)+(completed?10:0)),0,96),
      startTime:a.time,endTime:c.time,targetPrice:neck-height,breakoutPrice:neck,
      points:[point(a,"왼어깨"),point(b,"헤드"),point(c,"오른어깨")],
      reason:"세 개의 고점 중 중앙 고점이 가장 높고 양쪽 어깨 높이가 유사합니다.",
    });
  }

  for(let i=0;i<=lows.length-3;i++){
    const [a,b,c]=lows.slice(i,i+3);
    if(!(a.index<b.index&&b.index<c.index))continue;
    const shouldersClose=pct(a.price,c.price)<=0.025;
    const headLower=b.price<Math.min(a.price,c.price)*0.975;
    if(!shouldersClose||!headLower)continue;
    const neckHighs=highs.filter(h=>h.index>a.index&&h.index<c.index);
    if(neckHighs.length<2)continue;
    const neck=(neckHighs[0].price+neckHighs[neckHighs.length-1].price)/2;
    const last=candles[candles.length-1];
    const completed=last.close>neck;
    const height=neck-b.price;
    out.push({
      id:`ihs-${a.time}`,
      type:"inverse_head_shoulders",name:"역헤드앤숄더",direction:"bullish",
      status:completed?"completed":"forming",
      confidence:clamp(Math.round(68+(headLower?8:0)+(shouldersClose?8:0)+(completed?10:0)),0,96),
      startTime:a.time,endTime:c.time,targetPrice:neck+height,breakoutPrice:neck,
      points:[point(a,"왼어깨"),point(b,"헤드"),point(c,"오른어깨")],
      reason:"세 개의 저점 중 중앙 저점이 가장 낮고 양쪽 어깨 높이가 유사합니다.",
    });
  }
  return out;
}

function detectDouble(candles:PatternCandle[], ps:Pivot[]):DetectedPattern[]{
  const out:DetectedPattern[]=[];
  const highs=ps.filter(p=>p.kind==="high").slice(-10);
  const lows=ps.filter(p=>p.kind==="low").slice(-10);
  const last=candles[candles.length-1];

  for(let i=0;i<highs.length-1;i++){
    const a=highs[i],b=highs[i+1];
    if(b.index-a.index<8||pct(a.price,b.price)>0.018)continue;
    const between=lows.filter(l=>l.index>a.index&&l.index<b.index);
    if(!between.length)continue;
    const neck=Math.min(...between.map(x=>x.price));
    const depth=((a.price+b.price)/2)-neck;
    if(depth/neck<0.018)continue;
    const completed=last.close<neck;
    out.push({
      id:`dt-${a.time}`,type:"double_top",name:"이중 천장",direction:"bearish",
      status:completed?"completed":"forming",
      confidence:clamp(Math.round(66+(1-pct(a.price,b.price)/0.018)*12+(completed?12:0)),0,95),
      startTime:a.time,endTime:b.time,targetPrice:neck-depth,breakoutPrice:neck,
      points:[point(a,"1차 고점"),point({ ...b },"2차 고점")],
      reason:"유사한 가격대에서 두 번 고점을 형성하고 중간 저점이 확인됩니다.",
    });
  }

  for(let i=0;i<lows.length-1;i++){
    const a=lows[i],b=lows[i+1];
    if(b.index-a.index<8||pct(a.price,b.price)>0.018)continue;
    const between=highs.filter(h=>h.index>a.index&&h.index<b.index);
    if(!between.length)continue;
    const neck=Math.max(...between.map(x=>x.price));
    const depth=neck-((a.price+b.price)/2);
    if(depth/neck<0.018)continue;
    const completed=last.close>neck;
    out.push({
      id:`db-${a.time}`,type:"double_bottom",name:"이중 바닥",direction:"bullish",
      status:completed?"completed":"forming",
      confidence:clamp(Math.round(66+(1-pct(a.price,b.price)/0.018)*12+(completed?12:0)),0,95),
      startTime:a.time,endTime:b.time,targetPrice:neck+depth,breakoutPrice:neck,
      points:[point(a,"1차 저점"),point({ ...b },"2차 저점")],
      reason:"유사한 가격대에서 두 번 저점을 형성하고 중간 고점이 확인됩니다.",
    });
  }
  return out;
}

function detectWedgesAndTriangles(candles:PatternCandle[], ps:Pivot[]):DetectedPattern[]{
  const recentStart=Math.max(0,candles.length-100);
  const highs=ps.filter(p=>p.kind==="high"&&p.index>=recentStart).slice(-5);
  const lows=ps.filter(p=>p.kind==="low"&&p.index>=recentStart).slice(-5);
  if(highs.length<3||lows.length<3)return [];
  const hr=regression(highs),lr=regression(lows);
  const scale=candles[candles.length-1].close;
  const hSlope=hr.slope/scale,lSlope=lr.slope/scale;
  const startIdx=Math.min(highs[0].index,lows[0].index);
  const endIdx=candles.length-1;
  const upperStart=hr.slope*startIdx+hr.intercept;
  const lowerStart=lr.slope*startIdx+lr.intercept;
  const upperEnd=hr.slope*endIdx+hr.intercept;
  const lowerEnd=lr.slope*endIdx+lr.intercept;
  const widthStart=Math.max(1,upperStart-lowerStart);
  const widthEnd=upperEnd-lowerEnd;
  const converging=widthEnd>0&&widthEnd<widthStart*0.72;
  const out:DetectedPattern[]=[];
  const latest=candles[candles.length-1];

  if(converging&&hSlope>0&&lSlope>0&&lSlope>hSlope){
    const target=lowerEnd-widthStart*0.65;
    out.push({
      id:`rw-${candles[startIdx].time}`,type:"rising_wedge",name:"상승 쐐기형",direction:"bearish",
      status:latest.close<lowerEnd?"completed":"forming",
      confidence:clamp(Math.round(66+(1-widthEnd/widthStart)*22+(latest.close<lowerEnd?8:0)),0,94),
      startTime:candles[startIdx].time,endTime:latest.time,targetPrice:target,breakoutPrice:lowerEnd,
      points:[
        {time:highs[0].time,price:highs[0].price,label:"상단"},
        {time:highs[highs.length-1].time,price:highs[highs.length-1].price},
        {time:lows[0].time,price:lows[0].price,label:"하단"},
        {time:lows[lows.length-1].time,price:lows[lows.length-1].price},
      ],
      reason:"고점과 저점이 함께 상승하지만 두 추세선 간격이 좁아지는 수렴 구조입니다.",
    });
  }
  if(converging&&hSlope<0&&lSlope<0&&hSlope>lSlope){
    const target=upperEnd+widthStart*0.65;
    out.push({
      id:`fw-${candles[startIdx].time}`,type:"falling_wedge",name:"하락 쐐기형",direction:"bullish",
      status:latest.close>upperEnd?"completed":"forming",
      confidence:clamp(Math.round(66+(1-widthEnd/widthStart)*22+(latest.close>upperEnd?8:0)),0,94),
      startTime:candles[startIdx].time,endTime:latest.time,targetPrice:target,breakoutPrice:upperEnd,
      points:[
        {time:highs[0].time,price:highs[0].price,label:"상단"},
        {time:highs[highs.length-1].time,price:highs[highs.length-1].price},
        {time:lows[0].time,price:lows[0].price,label:"하단"},
        {time:lows[lows.length-1].time,price:lows[lows.length-1].price},
      ],
      reason:"고점과 저점이 함께 하락하지만 두 추세선 간격이 좁아지는 수렴 구조입니다.",
    });
  }

  const highFlat=Math.abs(hSlope)<0.00008;
  const lowFlat=Math.abs(lSlope)<0.00008;
  if(highFlat&&lSlope>0.00008){
    const resistance=highs.reduce((s,p)=>s+p.price,0)/highs.length;
    out.push({
      id:`at-${candles[startIdx].time}`,type:"ascending_triangle",name:"상승 삼각형",direction:"bullish",
      status:latest.close>resistance?"completed":"forming",
      confidence:clamp(Math.round(68+(latest.close>resistance?12:0)),0,92),
      startTime:candles[startIdx].time,endTime:latest.time,targetPrice:resistance+widthStart*0.7,breakoutPrice:resistance,
      points:[point(highs[0],"저항"),point(highs[highs.length-1]),point(lows[0],"상승 지지"),point(lows[lows.length-1])],
      reason:"상단 저항은 비교적 수평이고 저점은 높아지는 압축 구조입니다.",
    });
  }
  if(lowFlat&&hSlope< -0.00008){
    const support=lows.reduce((s,p)=>s+p.price,0)/lows.length;
    out.push({
      id:`dtg-${candles[startIdx].time}`,type:"descending_triangle",name:"하락 삼각형",direction:"bearish",
      status:latest.close<support?"completed":"forming",
      confidence:clamp(Math.round(68+(latest.close<support?12:0)),0,92),
      startTime:candles[startIdx].time,endTime:latest.time,targetPrice:support-widthStart*0.7,breakoutPrice:support,
      points:[point(highs[0],"하락 저항"),point(highs[highs.length-1]),point(lows[0],"지지"),point(lows[lows.length-1])],
      reason:"하단 지지는 비교적 수평이고 고점은 낮아지는 압축 구조입니다.",
    });
  }
  return out;
}

function detectCupHandle(candles:PatternCandle[]):DetectedPattern[]{
  if(candles.length<120)return [];
  const window=candles.slice(-180);
  const offset=candles.length-window.length;
  const firstThird=window.slice(0,60);
  const middle=window.slice(45,135);
  const lastThird=window.slice(120);
  const left=Math.max(...firstThird.map(c=>c.high));
  const right=Math.max(...lastThird.map(c=>c.high));
  const bottom=Math.min(...middle.map(c=>c.low));
  const rim=(left+right)/2;
  const depth=(rim-bottom)/rim;
  if(pct(left,right)>0.035||depth<0.07||depth>0.35)return [];
  let rightIndex=-1;
  for(let i=window.length-1;i>=0;i--){
    if(window[i].high===right){ rightIndex=i; break; }
  }
  if(rightIndex<0)return [];
  const handle=window.slice(rightIndex);
  if(handle.length<4)return [];
  const handleLow=Math.min(...handle.map(c=>c.low));
  const retrace=(right-handleLow)/(rim-bottom);
  if(retrace>0.55)return [];
  const latest=window[window.length-1];
  const completed=latest.close>rim;
  const start=firstThird.find(c=>c.high===left)??firstThird[0];
  const bottomC=middle.find(c=>c.low===bottom)??middle[0];
  const rightC=lastThird.find(c=>c.high===right)??lastThird[lastThird.length-1];
  return [{
    id:`cup-${start.time}`,type:"cup_handle",name:"컵앤핸들",direction:"bullish",
    status:completed?"completed":"forming",
    confidence:clamp(Math.round(70+(1-pct(left,right)/0.035)*10+(1-retrace/0.55)*8+(completed?8:0)),0,96),
    startTime:start.time,endTime:latest.time,targetPrice:rim+(rim-bottom),breakoutPrice:rim,
    points:[
      {time:start.time,price:left,label:"왼쪽 림"},
      {time:bottomC.time,price:bottom,label:"컵 바닥"},
      {time:rightC.time,price:right,label:"오른쪽 림"},
      {time:latest.time,price:latest.close,label:"핸들"},
    ],
    reason:"양쪽 림 가격이 유사하고 둥근 저점 이후 얕은 핸들 조정이 형성됩니다.",
  }];
}

export function analyzeChartPatterns(candles:PatternCandle[]):PatternForecast{
  if(candles.length<60){
    return {
      patterns:[],primary:null,bullishProbability:33,neutralProbability:34,bearishProbability:33,
      confidence:0,expected24hTarget:null,currentPrice:candles.at(-1)?.close??null,
      rsi14:rsi(candles),ema20:ema(candles,20),ema60:ema(candles,60),trend:"neutral",
    };
  }

  const recent=candles.slice(-1000);
  const ps=pivots(recent,3);
  const patterns=[
    ...detectHeadShoulders(recent,ps),
    ...detectDouble(recent,ps),
    ...detectWedgesAndTriangles(recent,ps),
    ...detectCupHandle(recent),
  ].sort((a,b)=>b.confidence-a.confidence).slice(0,8);

  const e20=ema(recent,20);
  const e60=ema(recent,60);
  const r=rsi(recent);
  const current=recent[recent.length-1].close;
  const trendState = e20!=null&&e60!=null
    ? e20>e60*1.002?"bullish":e20<e60*0.998?"bearish":"neutral"
    : "neutral";

  let bull=0,bear=0;
  for(const pattern of patterns.slice(0,4)){
    const weight=(pattern.confidence/100)*(pattern.status==="completed"?1:0.72);
    if(pattern.direction==="bullish")bull+=weight;
    if(pattern.direction==="bearish")bear+=weight;
  }
  if(trendState==="bullish")bull+=0.45;
  if(trendState==="bearish")bear+=0.45;
  if(r!=null&&r>55&&r<75)bull+=0.20;
  if(r!=null&&r<45&&r>25)bear+=0.20;

  const signal=bull-bear;
  let bullish=33+signal*18;
  let bearish=33-signal*18;
  let neutral=34-Math.abs(signal)*5;
  bullish=clamp(bullish,10,75);
  bearish=clamp(bearish,10,75);
  neutral=clamp(neutral,15,55);
  const total=bullish+bearish+neutral;
  bullish=Math.round(bullish/total*100);
  bearish=Math.round(bearish/total*100);
  neutral=100-bullish-bearish;

  const primary=patterns[0]??null;
  const confidence=primary
    ? clamp(Math.round(primary.confidence*0.72+Math.abs(signal)*15),20,94)
    : clamp(Math.round(35+Math.abs(signal)*20),20,65);

  return {
    patterns,primary,
    bullishProbability:bullish,
    neutralProbability:neutral,
    bearishProbability:bearish,
    confidence,
    expected24hTarget:primary?.targetPrice??null,
    currentPrice:current,
    rsi14:r,
    ema20:e20,
    ema60:e60,
    trend:trendState,
  };
}
