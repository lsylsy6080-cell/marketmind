export type TrendCandle={time:number;open:number;high:number;low:number;close:number;volume:number};
export type TrendDirection='strong_bull'|'bull'|'bull_weakening'|'transition'|'bear_transition'|'bear'|'strong_bear';
export type SwingPoint={index:number;time:number;price:number;kind:'high'|'low';label:'HH'|'HL'|'LH'|'LL'|'H'|'L'};
export type StructureEvent={time:number;price:number;type:'BOS'|'CHoCH';direction:'bullish'|'bearish'};
export type TrendContribution={name:string;score:number;max:number;detail:string};
export type TrendScenario={kind:'bullish'|'neutral'|'bearish';label:string;strength:number;condition:string;state:'active'|'watch'|'invalidated';reason:string};
export type TrendTimeframe='1h'|'4h'|'1d'|'1w'|'1M'|'generic';
export type IchimokuPoint={time:number;conversion:number|null;base:number|null;spanA:number|null;spanB:number|null};
export type TrendSummary={
 label:string;direction:TrendDirection;score:number;confidence:number;risk:number;structure:string;ema:string;ichimoku:string;
 adx:number;rsi:number;atr:number;support:number|null;resistance:number|null;supportStrength:number;resistanceStrength:number;
 analysis:string[];warnings:string[];contributions:TrendContribution[];swings:SwingPoint[];events:StructureEvent[];
 ema20:number;ema50:number;ema100:number;ema200:number;lastPrice:number;trendContinuation:number;reversalRisk:number;
 phase:string;dataQuality:number;volumeConfirmation:string;divergence:string;supportDistance:number|null;resistanceDistance:number|null;
 scenarios:TrendScenario[];
 majorSwingCount:number; latestStructureAgeBars:number|null; weeklyStability:string;
};

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function avg(v:number[]){return v.length?v.reduce((a,b)=>a+b,0)/v.length:0}
function emaArray(v:number[],p:number){if(!v.length)return[];const k=2/(p+1);let e=v[0];return v.map((x,i)=>{e=i===0?x:x*k+e*(1-k);return e})}
export function emaData(c:TrendCandle[],p:number){const a=emaArray(c.map(x=>x.close),p);return c.map((x,i)=>({time:x.time,value:a[i]})).filter((_,i)=>i>=p-1)}
export function rsiSeries(c:TrendCandle[],p=14){if(c.length<2)return[] as {time:number;value:number}[];const out:{time:number;value:number}[]=[];for(let end=p;end<c.length;end++){let g=0,l=0;for(let i=end-p+1;i<=end;i++){const d=c[i].close-c[i-1].close;if(d>=0)g+=d;else l-=d}const val=l===0?100:100-100/(1+(g/p)/(l/p));out.push({time:c[end].time,value:val})}return out}
export function atrSeries(c:TrendCandle[],p=14){const tr:number[]=[];for(let i=0;i<c.length;i++){const prev=i?c[i-1].close:c[i].open;tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-prev),Math.abs(c[i].low-prev)))}const out:{time:number;value:number}[]=[];for(let i=p-1;i<c.length;i++)out.push({time:c[i].time,value:avg(tr.slice(i-p+1,i+1))});return out}
export function adxSeries(c:TrendCandle[],p=14){if(c.length<p*2+2)return[] as {time:number;value:number;plus:number;minus:number}[];const tr:number[]=[],plus:number[]=[],minus:number[]=[];for(let i=1;i<c.length;i++){const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)))}const dx:{time:number;value:number;plus:number;minus:number}[]=[];for(let i=p-1;i<tr.length;i++){const t=avg(tr.slice(i-p+1,i+1));const pd=t?100*avg(plus.slice(i-p+1,i+1))/t:0;const md=t?100*avg(minus.slice(i-p+1,i+1))/t:0;const d=pd+md?100*Math.abs(pd-md)/(pd+md):0;dx.push({time:c[i+1].time,value:d,plus:pd,minus:md})}const out:{time:number;value:number;plus:number;minus:number}[]=[];for(let i=p-1;i<dx.length;i++)out.push({time:dx[i].time,value:avg(dx.slice(i-p+1,i+1).map(x=>x.value)),plus:dx[i].plus,minus:dx[i].minus});return out}

function mid(c:TrendCandle[],end:number,p:number){if(end-p+1<0)return null;const w=c.slice(end-p+1,end+1);return (Math.max(...w.map(x=>x.high))+Math.min(...w.map(x=>x.low)))/2}
export function ichimokuSeries(c:TrendCandle[]):IchimokuPoint[]{return c.map((x,i)=>{const conversion=mid(c,i,9),base=mid(c,i,26),b=mid(c,i,52);return {time:x.time,conversion,base,spanA:conversion!=null&&base!=null?(conversion+base)/2:null,spanB:b}})}

export function detectSwings(c:TrendCandle[],radius=4):SwingPoint[]{
 const raw:{index:number;time:number;price:number;kind:'high'|'low'}[]=[];
 for(let i=radius;i<c.length-radius;i++){let h=true,l=true;for(let j=i-radius;j<=i+radius;j++){if(i===j)continue;if(c[j].high>=c[i].high)h=false;if(c[j].low<=c[i].low)l=false}if(h)raw.push({index:i,time:c[i].time,price:c[i].high,kind:'high'});if(l)raw.push({index:i,time:c[i].time,price:c[i].low,kind:'low'})}
 raw.sort((a,b)=>a.index-b.index);
 // 같은 종류의 작은 스윙은 더 극단적인 점만 남겨 장기 구조 노이즈를 줄인다.
 const compressed:typeof raw=[];for(const x of raw){const prev=compressed.at(-1);if(prev&&prev.kind===x.kind){if((x.kind==='high'&&x.price>prev.price)||(x.kind==='low'&&x.price<prev.price))compressed[compressed.length-1]=x}else compressed.push(x)}
 const atr=atrSeries(c,14).at(-1)?.value??0;const minMove=Math.max(atr*1.35,(c.at(-1)?.close??0)*0.008);
 const major:typeof raw=[];for(const x of compressed){const prev=major.at(-1);if(!prev){major.push(x);continue}if(x.kind!==prev.kind&&Math.abs(x.price-prev.price)>=minMove)major.push(x)}
 let lastHigh:number|null=null,lastLow:number|null=null;
 return major.map(x=>{let label:'HH'|'HL'|'LH'|'LL'|'H'|'L';if(x.kind==='high'){label=lastHigh==null?'H':x.price>lastHigh?'HH':'LH';lastHigh=x.price}else{label=lastLow==null?'L':x.price>lastLow?'HL':'LL';lastLow=x.price}return {...x,label}})
}

export function detectStructureEvents(c:TrendCandle[],swings:SwingPoint[]):StructureEvent[]{const out:StructureEvent[]=[];let lastHigh:SwingPoint|null=null,lastLow:SwingPoint|null=null,lastDirection:'bullish'|'bearish'|null=null;for(const s of swings){if(s.kind==='high')lastHigh=s;else lastLow=s;const from=s.index+1,to=Math.min(c.length-1,s.index+40);for(let i=from;i<=to;i++){if(s.kind==='high'&&c[i].close>s.price){const type:'BOS'|'CHoCH'=lastDirection==='bearish'?'CHoCH':'BOS';out.push({time:c[i].time,price:c[i].close,type,direction:'bullish'});lastDirection='bullish';break}if(s.kind==='low'&&c[i].close<s.price){const type:'BOS'|'CHoCH'=lastDirection==='bullish'?'CHoCH':'BOS';out.push({time:c[i].time,price:c[i].close,type,direction:'bearish'});lastDirection='bearish';break}}}return out.filter((x,i,a)=>i===0||x.time!==a[i-1].time).slice(-8)}

function levelStrength(c:TrendCandle[],level:number,look=220){if(!level)return 0;const tol=0.006;let touches=0;for(const x of c.slice(-look)){if(Math.abs(x.high-level)/level<tol||Math.abs(x.low-level)/level<tol)touches++}return clamp(Math.round(touches/2),1,5)}
function slope(values:number[],bars=20){if(values.length<bars+1)return 0;const a=values[values.length-bars-1],b=values.at(-1)!;return a?((b-a)/a)*100:0}


function volumeConfirmation(c:TrendCandle[],events:StructureEvent[]){
 const e=events.at(-1);if(!e)return {score:0,text:'최근 확정 구조 이벤트 없음'};
 const i=c.findIndex(x=>x.time===e.time);if(i<20)return {score:0,text:'거래량 비교 표본 부족'};
 const base=avg(c.slice(Math.max(0,i-20),i).map(x=>x.volume));const ratio=base?c[i].volume/base:1;
 const good=ratio>=1.25;return {score:good?(e.direction==='bullish'?7:-7):0,text:`${e.type} 거래량 ${ratio.toFixed(2)}배 · ${good?'돌파 확인':'확인 약함'}`};
}
function rsiDivergence(c:TrendCandle[],swings:SwingPoint[]){
 const rs=rsiSeries(c);const map=new Map(rs.map(x=>[x.time,x.value]));const hs=swings.filter(x=>x.kind==='high'&&map.has(x.time)).slice(-2),ls=swings.filter(x=>x.kind==='low'&&map.has(x.time)).slice(-2);
 if(hs.length===2&&hs[1].price>hs[0].price&&(map.get(hs[1].time)??0)<(map.get(hs[0].time)??0)-2)return {score:-6,text:'약세 다이버전스 · 가격 HH / RSI LH'};
 if(ls.length===2&&ls[1].price<ls[0].price&&(map.get(ls[1].time)??0)>(map.get(ls[0].time)??0)+2)return {score:6,text:'강세 다이버전스 · 가격 LL / RSI HL'};
 return {score:0,text:'유의미한 RSI 다이버전스 없음'};
}
function phaseLabel(score:number,risk:number,event:StructureEvent|undefined){
 if(score>=78&&risk<45)return '강한 상승';
 if(score>=60&&event?.type==='CHoCH'&&event.direction==='bearish')return '상승 약화';
 if(score>=58)return '상승';
 if(score>45&&score<58)return '전환 구간';
 if(score<=40&&event?.type==='CHoCH'&&event.direction==='bullish')return '하락 전환 시도';
 if(score<=22)return '강한 하락';
 if(score<=42)return '하락';
 return '중립';
}
export function analyzeLongTermTrend(candles:TrendCandle[],timeframe:TrendTimeframe='generic'):TrendSummary{
 const c=candles.slice(-2200);const closes=c.map(x=>x.close);const last=closes.at(-1)??0;
 const dataQuality=clamp(Math.round(Math.min(1,c.length/260)*100),0,100);
 const e20a=emaArray(closes,20),e50a=emaArray(closes,50),e100a=emaArray(closes,100),e200a=emaArray(closes,200);
 const e20=e20a.at(-1)??0,e50=e50a.at(-1)??0,e100=e100a.at(-1)??0,e200=e200a.at(-1)??0;
 const bull=last>e20&&e20>e50&&e50>e100&&e100>e200,bear=last<e20&&e20<e50&&e50<e100&&e100<e200;
 const emaSlope=(slope(e20a)+slope(e50a)+slope(e100a)+slope(e200a))/4;
 const radius=timeframe==='1w'?10:timeframe==='1d'?8:timeframe==='4h'?7:Math.max(5,Math.min(14,Math.round(c.length/140)));
 const swings=detectSwings(c,radius);const recentSwings=swings.slice(timeframe==='1w'?-8:-10);const events=detectStructureEvents(c,swings);
 const latestEventAge=events.length?Math.max(0,c.length-1-c.findIndex(x=>x.time===events.at(-1)!.time)):null;
 const eventFreshLimit=timeframe==='1w'?18:timeframe==='1d'?45:timeframe==='4h'?90:120;
 const freshEvent=latestEventAge!=null&&latestEventAge<=eventFreshLimit?events.at(-1):undefined;
 const highs=recentSwings.filter(x=>x.kind==='high').slice(-2),lows=recentSwings.filter(x=>x.kind==='low').slice(-2);
 const structure=highs.length>=2&&lows.length>=2?(highs[1].price>highs[0].price&&lows[1].price>lows[0].price?'HH → HL 상승 구조':highs[1].price<highs[0].price&&lows[1].price<lows[0].price?'LH → LL 하락 구조':'혼조 / 전환 구조'):'구조 데이터 수집 중';
 const ich=ichimokuSeries(c),ii=ich.at(-1);const top=Math.max(ii?.spanA??last,ii?.spanB??last),bottom=Math.min(ii?.spanA??last,ii?.spanB??last);
 const futureBull=(ii?.spanA??0)>(ii?.spanB??0);const cloudThickness=last?Math.abs((ii?.spanA??last)-(ii?.spanB??last))/last*100:0;
 const ichBull=last>top&&((ii?.conversion??0)>(ii?.base??0)),ichBear=last<bottom&&((ii?.conversion??0)<(ii?.base??0));
 const ichimoku=last>top?`구름 위 · ${futureBull?'미래 구름 상승':'미래 구름 약화'} · 두께 ${cloudThickness.toFixed(1)}%`:last<bottom?`구름 아래 · ${!futureBull?'미래 구름 하락':'미래 구름 개선'} · 두께 ${cloudThickness.toFixed(1)}%`:'구름 내부 · 전환/중립';
 const adx=adxSeries(c).at(-1),rs=rsiSeries(c).at(-1)?.value??50,at=atrSeries(c).at(-1)?.value??0;
 const recent=c.slice(-300),pivotLows=swings.filter(x=>x.kind==='low'&&x.index>=c.length-420).map(x=>x.price),pivotHighs=swings.filter(x=>x.kind==='high'&&x.index>=c.length-420).map(x=>x.price);
 const support=(pivotLows.filter(x=>x<last).sort((a,b)=>b-a)[0]??Math.min(...recent.map(x=>x.low))),resistance=(pivotHighs.filter(x=>x>last).sort((a,b)=>a-b)[0]??Math.max(...recent.map(x=>x.high)));
 const supportDistance=support&&last?+(((support-last)/last)*100).toFixed(2):null,resistanceDistance=resistance&&last?+(((resistance-last)/last)*100).toFixed(2):null;
 const latestEvent=freshEvent,structureScore=structure.includes('상승')?26:structure.includes('하락')?-26:latestEvent?.direction==='bullish'?10:latestEvent?.direction==='bearish'?-10:0;
 const emaScore=bull?22:bear?-22:clamp(emaSlope*1.8,-10,10),ichiScore=ichBull?15:ichBear?-15:last>top?7:last<bottom?-7:0;
 const adxDir=(adx?.plus??0)>=(adx?.minus??0)?1:-1,adxScore=(adx?.value??0)>=25?clamp(((adx?.value??25)-20)*.45,2,11)*adxDir:0;
 const rsiScore=rs>55&&rs<72?4:rs<45&&rs>28?-4:0,vol=volumeConfirmation(c,events),div=rsiDivergence(c,swings);
 let total=50+structureScore+emaScore+ichiScore+adxScore+rsiScore+vol.score+div.score;
 let weeklyStability='해당 없음';
 if(timeframe==='1w'){
   const enoughMajor=swings.length>=6;
   const trendConfirmBear=bear||ichBear||((adx?.value??0)>=25&&adxDir<0);
   const trendConfirmBull=bull||ichBull||((adx?.value??0)>=25&&adxDir>0);
   if(!enoughMajor){
     total=50+(total-50)*.48;
     weeklyStability=`Major Swing ${swings.length}개 · 최소 6개 미만으로 강한 판정 제한`;
   }else if(total<=25&&!trendConfirmBear){
     total=28;
     weeklyStability='하락 구조는 있으나 EMA·일목·ADX 확인 부족 → 강한 하락 확정 보류';
   }else if(total>=75&&!trendConfirmBull){
     total=72;
     weeklyStability='상승 구조는 있으나 EMA·일목·ADX 확인 부족 → 강한 상승 확정 보류';
   }else{
     weeklyStability=`Major Swing ${swings.length}개 · 장기 확인 조건 충족`;
   }
 }
 // CHoCH는 기존 추세를 즉시 뒤집지 않고 중립 방향으로 끌어당겨 '전환 구간'으로 처리한다.
 if(latestEvent?.type==='CHoCH')total=total*.78+50*.22;
 total=clamp(Math.round(total),0,100);
 let risk=48-Math.abs(total-50)*.45;if(rs>72||rs<28)risk+=9;if(latestEvent?.type==='CHoCH')risk+=22;if((adx?.value??0)<18)risk+=7;if(div.score!==0)risk+=7;risk=clamp(Math.round(risk),5,95);
 const phase=phaseLabel(total,risk,latestEvent);
 const direction:TrendDirection=phase==='강한 상승'?'strong_bull':phase==='상승'?'bull':phase==='상승 약화'?'bull_weakening':phase==='전환 구간'?'transition':phase==='하락 전환 시도'?'bear_transition':phase==='강한 하락'?'strong_bear':phase==='하락'?'bear':'transition';
 const label=phase;
 const evidence=[structureScore,emaScore,ichiScore,adxScore,vol.score,div.score].filter(x=>Math.abs(x)>=3),pos=evidence.filter(x=>x>0).length,neg=evidence.filter(x=>x<0).length;
 const confidence=clamp(Math.round((52+Math.abs(total-50)*.55+Math.abs(pos-neg)*4)*(dataQuality/100)),35,94);
 const continuation=clamp(Math.round((100-risk)*.55+confidence*.35+Math.abs(total-50)*.2),15,92),reversal=100-continuation;
 const contributions:TrendContribution[]=[
  {name:'시장구조',score:structureScore,max:26,detail:structure},
  {name:'EMA 정렬·기울기',score:Math.round(emaScore),max:22,detail:`${bull?'정배열':bear?'역배열':'혼조'} · 평균 기울기 ${emaSlope.toFixed(2)}%`},
  {name:'일목균형표',score:ichiScore,max:15,detail:ichimoku},
  {name:'ADX 방향·강도',score:Math.round(adxScore),max:11,detail:`ADX ${(adx?.value??0).toFixed(1)} · +DI ${(adx?.plus??0).toFixed(1)} / -DI ${(adx?.minus??0).toFixed(1)} · ${adxDir>0?'상승':'하락'} 방향 근소 우세`},
  {name:'구조 돌파 거래량',score:vol.score,max:7,detail:vol.text},
  {name:'RSI / 다이버전스',score:rsiScore+div.score,max:10,detail:`RSI ${rs.toFixed(1)} · ${div.text}`}
 ];
 const warnings:string[]=[];
 if(dataQuality<80)warnings.push(`장기 분석 표본 충족도 ${dataQuality}/100으로 데이터가 더 쌓이면 판정 안정성이 높아집니다.`);
 if(latestEvent?.type==='CHoCH')warnings.push(`최근 ${latestEvent.direction==='bullish'?'상승':'하락'} CHoCH가 감지되어 기존 추세의 전환 여부를 확인해야 합니다.`);
 if(events.length&&!latestEvent)warnings.push(`마지막 구조 이벤트가 ${latestEventAge}봉 전으로 오래되어 현재 추세 판정 가중치에서 제외했습니다.`);
 if(timeframe==='1w'&&weeklyStability!=='해당 없음')warnings.push(`주봉 안정화: ${weeklyStability}.`);
 if(div.score<0)warnings.push('가격 고점은 높아졌지만 RSI 고점은 낮아지는 약세 다이버전스가 있습니다.');
 if(div.score>0)warnings.push('가격 저점은 낮아졌지만 RSI 저점은 높아지는 강세 다이버전스가 있습니다.');
 if(rs>72)warnings.push('RSI 과열권으로 단기 조정 위험이 높아졌습니다.');if(rs<28)warnings.push('RSI 과매도권으로 기술적 반등 가능성이 커졌습니다.');
 if((adx?.value??0)<18)warnings.push('ADX가 낮아 방향성 신뢰도가 떨어지는 구간입니다.');if(!warnings.length)warnings.push('현재 장기 추세를 훼손하는 뚜렷한 조기 경고는 제한적입니다.');
 const analysis=[`${structure}가 관찰됩니다.`,`${bull?'EMA 장기 정배열이 유지되고 있습니다.':bear?'EMA 장기 역배열이 유지되고 있습니다.':'EMA 배열은 혼조이며 구조 변화와 함께 판단합니다.'}`,`일목균형표는 ${ichimoku} 상태입니다.`,`${vol.text}.`,`${div.text}.`,latestEvent?`최근 Major 구조 이벤트는 ${latestEvent.type} ${latestEvent.direction==='bullish'?'상승':'하락'} 방향입니다.`:'최근 확정된 Major BOS/CHoCH 이벤트가 없습니다.'];
 const resistanceBreak=resistance>0&&last>resistance;
 const supportBreak=support>0&&last<support;
 const recentVolRatio=(()=>{const xs=c.slice(-21);if(xs.length<5)return 1;const base=avg(xs.slice(0,-1).map(x=>x.volume));return base?xs.at(-1)!.volume/base:1})();
 const bullishTrigger=resistanceBreak&&recentVolRatio>=1.2;
 const bearishTrigger=supportBreak&&(latestEvent?.direction==='bearish'||structure.includes('하락'));
 const rangeTrigger=!resistanceBreak&&!supportBreak&&support<last&&last<resistance;
 let bullStrength=clamp(Math.round(total*.62+(bullishTrigger?22:0)+(latestEvent?.type==='BOS'&&latestEvent.direction==='bullish'?8:0)),5,92);
 let bearStrength=clamp(Math.round((100-total)*.62+(bearishTrigger?22:0)+(latestEvent?.type==='BOS'&&latestEvent.direction==='bearish'?8:0)),5,92);
 let neutralStrength=clamp(Math.round(24+(rangeTrigger?18:0)-Math.abs(total-50)*.22),5,60);
 const sum=bullStrength+bearStrength+neutralStrength;bullStrength=Math.round(bullStrength/sum*100);bearStrength=Math.round(bearStrength/sum*100);neutralStrength=100-bullStrength-bearStrength;
 const scenarios:TrendScenario[]=[
  {kind:'bullish',label:'상승 지속',strength:bullStrength,state:bullishTrigger?'active':supportBreak?'invalidated':'watch',reason:bullishTrigger?'저항 돌파와 거래량 증가가 동시에 확인됨':supportBreak?'핵심 지지 이탈로 상승 시나리오 훼손':'저항 돌파 확인 대기',condition:resistance?`${resistance.toLocaleString('en-US',{maximumFractionDigits:0})} 저항 돌파 + 거래량 1.2배 이상 시 자동 승격`:'상단 Major 저항 돌파 + 거래량 확인'},
  {kind:'neutral',label:'횡보 / 조정',strength:neutralStrength,state:rangeTrigger?'active':(bullishTrigger||bearishTrigger)?'invalidated':'watch',reason:rangeTrigger?'가격이 핵심 지지·저항 사이에 위치':'범위 이탈 여부 확인 중',condition:support&&resistance?`${support.toLocaleString('en-US',{maximumFractionDigits:0})} ~ ${resistance.toLocaleString('en-US',{maximumFractionDigits:0})} 범위 유지`:'주요 지지·저항 범위 유지'},
  {kind:'bearish',label:'하락 전환',strength:bearStrength,state:bearishTrigger?'active':resistanceBreak?'invalidated':'watch',reason:bearishTrigger?'핵심 지지 이탈과 하락 구조가 확인됨':resistanceBreak?'핵심 저항 돌파로 하락 시나리오 약화':'지지 이탈 + 하락 구조 확인 대기',condition:support?`${support.toLocaleString('en-US',{maximumFractionDigits:0})} 지지 이탈 + 하락 CHoCH/BOS 시 자동 승격`:'Major 지지 이탈 + 하락 구조 확인'}
 ];
 return {label,direction,score:total,confidence,risk,structure,ema:`EMA 20/50/100/200 ${bull?'정배열':bear?'역배열':'혼조'}`,ichimoku,adx:+(adx?.value??0).toFixed(1),rsi:+rs.toFixed(1),atr:+at.toFixed(1),support:Number.isFinite(support)?support:null,resistance:Number.isFinite(resistance)?resistance:null,supportStrength:levelStrength(c,support),resistanceStrength:levelStrength(c,resistance),analysis,warnings,contributions,swings:recentSwings,events:events.slice(-5),ema20:e20,ema50:e50,ema100:e100,ema200:e200,lastPrice:last,trendContinuation:continuation,reversalRisk:reversal,phase,dataQuality,volumeConfirmation:vol.text,divergence:div.text,supportDistance,resistanceDistance,scenarios,majorSwingCount:swings.length,latestStructureAgeBars:latestEventAge,weeklyStability};
}

export function combineLongTermTrends(weekly:TrendSummary|null,daily:TrendSummary|null,fourHour:TrendSummary|null){
 const items=[{x:weekly,w:.4},{x:daily,w:.4},{x:fourHour,w:.2}].filter(v=>v.x) as {x:TrendSummary;w:number}[];if(!items.length)return null;
 const weight=items.reduce((s,v)=>s+v.w,0),score=Math.round(items.reduce((s,v)=>s+v.x.score*v.w,0)/weight),confidence=Math.round(items.reduce((s,v)=>s+v.x.confidence*v.w,0)/weight),risk=Math.round(items.reduce((s,v)=>s+v.x.risk*v.w,0)/weight);
 const bullish=items.filter(v=>v.x.score>=60).reduce((s,v)=>s+v.w,0)/weight,bearish=items.filter(v=>v.x.score<=40).reduce((s,v)=>s+v.w,0)/weight;
 let label=score>=78?'강한 상승':score>=60?'상승':score<=22?'강한 하락':score<=40?'하락':'전환 / 중립';
 if(bullish>=.6&&risk>=45)label='상승 약화';if(bearish>=.6&&risk>=45)label='하락 전환 관찰';
 return {score,confidence,risk,label,continuation:Math.round(items.reduce((s,v)=>s+v.x.trendContinuation*v.w,0)/weight),reversal:Math.round(items.reduce((s,v)=>s+v.x.reversalRisk*v.w,0)/weight)};
}
