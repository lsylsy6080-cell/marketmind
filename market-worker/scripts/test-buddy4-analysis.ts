import { execFileSync } from "node:child_process";
import { calculateEma,calculateRsi,calculateMacd,calculateAtr,calculateAdx,calculateBollingerBands,calculateVolumeMetrics,calculateObv,calculateMfi,type Candle } from "../src/indicators/technical";
import { calculateTechnicalMarketScore } from "../src/scorers/technical-score";
// One-shot test of the original indicator/scorer functions against local PostgreSQL.
// Intentionally does not start the normal Supabase worker.
const db=process.env.PGDATABASE||"marketmind";
function psql(query:string) {return execFileSync("psql",["-X","-q","-t","-A","-v","ON_ERROR_STOP=1","-d",db,"-c",query],{encoding:"utf8",timeout:30000}).trim();}
const q="SELECT COALESCE(json_agg(row_to_json(t))::text,'[]') FROM (SELECT open_time,open,high,low,close,volume FROM public.market_candles WHERE exchange='binance' AND market_type='spot' AND symbol='BTCUSDT' AND timeframe='1m' AND is_closed=true ORDER BY open_time DESC LIMIT 500) t";
const records=JSON.parse(psql(q)) as Record<string,unknown>[];
if(records.length<240)throw new Error("Insufficient 1m candles: "+records.length+" (need 240)");
const candles:Candle[]=records.reverse().map(r=>({openTime:String(r.open_time),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume)}));
const latest=candles[candles.length-1],close=candles.map(c=>c.close),volume=candles.map(c=>c.volume);
const ema20=calculateEma(close,20),ema60=calculateEma(close,60),ema120=calculateEma(close,120),ema240=calculateEma(close,240);
const rsi14=calculateRsi(close,14),m=calculateMacd(close),atr14=calculateAtr(candles,14),adx14=calculateAdx(candles,14);
const b=calculateBollingerBands(close,20),v=calculateVolumeMetrics(volume,20),obv=calculateObv(candles),mfi14=calculateMfi(candles,14);
const nums=[ema20,ema60,ema120,ema240,rsi14,m.macd,m.signal,m.histogram,atr14,adx14,b.upper,b.middle,b.lower,b.width,v.volumeMa,v.volumeRatio,obv,mfi14];
if(nums.some(x=>x===null||!Number.isFinite(x)))throw new Error("Invalid indicators");
const trend=latest.close>ema20!&&ema20!>ema60!&&ema60!>ema120!&&ema120!>ema240!?"strong_bullish":latest.close<ema20!&&ema20!<ema60!&&ema60!<ema120!&&ema120!<ema240!?"strong_bearish":latest.close>ema20!&&ema20!>ema60!?"bullish":latest.close<ema20!&&ema20!<ema60!?"bearish":"neutral";
const r=candles.slice(-20),a=r.slice(0,10),z=r.slice(10);
const structure=Math.max(...z.map(x=>x.high))>Math.max(...a.map(x=>x.high))&&Math.min(...z.map(x=>x.low))>Math.min(...a.map(x=>x.low))?"higher_high_higher_low":Math.max(...z.map(x=>x.high))<Math.max(...a.map(x=>x.high))&&Math.min(...z.map(x=>x.low))<Math.min(...a.map(x=>x.low))?"lower_high_lower_low":"range";
const snap={exchange:"binance",market_type:"spot",symbol:"BTCUSDT",timeframe:"1m",candle_open_time:latest.openTime,analyzed_at:new Date().toISOString(),close_price:latest.close,ema_20:ema20,ema_60:ema60,ema_120:ema120,ema_240:ema240,rsi_14:rsi14,macd:m.macd,macd_signal:m.signal,macd_histogram:m.histogram,atr_14:atr14,adx_14:adx14,bollinger_upper:b.upper,bollinger_middle:b.middle,bollinger_lower:b.lower,bollinger_width:b.width,volume_ma_20:v.volumeMa,volume_ratio:v.volumeRatio,obv,mfi_14:mfi14,market_structure:structure,trend_direction:trend,momentum_direction:rsi14!>=60&&m.histogram!>0?"bullish":rsi14!<=40&&m.histogram!<0?"bearish":"neutral",volatility_state:b.width!>=0.04?"high":b.width!<=0.015?"low":"normal",indicator_data:{candle_count:candles.length,indicator_version:"1.0.0",macd_settings:{fast:12,slow:26,signal:9},bollinger_settings:{period:20,deviation:2}}};
const s=calculateTechnicalMarketScore(snap as any);
const score={symbol:"BTCUSDT",analyzed_at:latest.openTime,market_regime:s.marketRegime,direction:s.direction,total_score:s.totalScore,confidence:s.confidence,trend_score:s.trendScore,momentum_score:s.momentumScore,volume_score:s.volumeScore,structure_score:s.structureScore,volatility_score:s.volatilityScore,derivatives_score:s.derivativesScore,trading_permission:s.tradingPermission,risk_level:s.riskLevel,strategy_version:"btc-market-v1",score_details:s.details};
function lit(o:unknown){return "'"+JSON.stringify(o).replace(/'/g,"''")+"'::jsonb"}
function insert(table:string,o:Record<string,unknown>,keys:string[]){const cols=Object.keys(o);return "INSERT INTO public."+table+" ("+cols.join(",")+") SELECT "+cols.map(x=>"v."+x).join(",")+" FROM jsonb_populate_record(null::public."+table+","+lit(o)+") v ON CONFLICT ("+keys.join(",")+") DO UPDATE SET "+cols.filter(x=>!keys.includes(x)).map(x=>x+"=excluded."+x).join(",")+";"}
psql("BEGIN;"+insert("technical_snapshots",snap,["exchange","market_type","symbol","timeframe","candle_open_time"])+insert("market_scores",score,["symbol","strategy_version","analyzed_at"])+"COMMIT;");
console.log(JSON.stringify({ok:true,sourceCandles:candles.length,candleTime:latest.openTime,score:s.totalScore,confidence:s.confidence,direction:s.direction,db},null,2));
