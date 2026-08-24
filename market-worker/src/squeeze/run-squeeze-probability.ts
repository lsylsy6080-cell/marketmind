import "dotenv/config";
import {supabase} from "../lib/supabase";
import {calculateSqueezeProbability} from "./SqueezeProbabilityEngine";
const n=(v:unknown):number|null=>{const x=Number(v);return Number.isFinite(x)?x:null};
export async function runSqueezeProbability(){
 const [{data:liqMap,error:lmErr},{data:oi,error:oiErr},{data:liq,error:liqErr},{data:gf,error:gfErr}]=await Promise.all([
  supabase.from("estimated_liquidation_maps").select("current_price,long_zones,short_zones,calculated_at").eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
  supabase.from("open_interest_snapshots").select("*").eq("symbol","BTCUSDT").order("fetched_at",{ascending:false}).limit(1).maybeSingle(),
  supabase.from("btc_liquidation_snapshots").select("*").eq("symbol","BTCUSDT").order("bucket_time",{ascending:false}).limit(1).maybeSingle(),
  supabase.from("global_futures_snapshots").select("*").eq("symbol","BTCUSDT").order("fetched_at",{ascending:false}).limit(1).maybeSingle(),
 ]);
 if(lmErr)throw new Error(`[Squeeze] liquidation map 조회 실패: ${lmErr.message}`);
 if(!liqMap)return{status:"warming_up",reason:"Estimated Liquidation Map이 아직 없습니다.",result:null};
 if(oiErr)throw new Error(`[Squeeze] OI 조회 실패: ${oiErr.message}`);
 if(liqErr)throw new Error(`[Squeeze] liquidation intelligence 조회 실패: ${liqErr.message}`);
 if(gfErr)throw new Error(`[Squeeze] global futures 조회 실패: ${gfErr.message}`);
 const current=n(liqMap.current_price);if(current==null||current<=0)throw new Error("[Squeeze] invalid current price");
 const longZones=Array.isArray(liqMap.long_zones)?liqMap.long_zones:[],shortZones=Array.isArray(liqMap.short_zones)?liqMap.short_zones:[];
 const takerCoverage=n(gf?.taker_source_coverage_percent)??0;
 const rawTaker=n(gf?.global_taker_buy_ratio);
 const taker=takerCoverage>=20?rawTaker:null;
 const result=calculateSqueezeProbability({
  currentPrice:current,
  priceChange5mPercent:n(oi?.price_change_5m_percent),
  oiChange5mPercent:n(oi?.oi_change_5m_percent),
  takerBuyRatio:taker,
  liquidationState:liq?.state??null,
  liquidationBias:liq?.directional_bias??null,
  liquidationConfidence:n(liq?.confidence),
  longLiquidationUsd:n(liq?.long_liquidation_usd),
  shortLiquidationUsd:n(liq?.short_liquidation_usd),
  longZones:longZones.map((z:any)=>({centerPrice:Number(z.centerPrice),intensity:Number(z.intensity??0),confidence:Number(z.confidence??0)})),
  shortZones:shortZones.map((z:any)=>({centerPrice:Number(z.centerPrice),intensity:Number(z.intensity??0),confidence:Number(z.confidence??0)})),
  dataReliability:Math.min(100,60+takerCoverage*.4),
 });
 const bucket=new Date(Math.floor(Date.now()/60000)*60000).toISOString();
 const {error:saveError}=await supabase.from("squeeze_probability_snapshots").upsert({
  symbol:"BTCUSDT",bucket_time:bucket,calculated_at:result.calculatedAt,current_price:result.currentPrice,
  long_squeeze_probability:result.longSqueeze.probability,long_squeeze_level:result.longSqueeze.level,
  short_squeeze_probability:result.shortSqueeze.probability,short_squeeze_level:result.shortSqueeze.level,
  dominant_risk:result.dominantRisk,long_squeeze:result.longSqueeze,short_squeeze:result.shortSqueeze,
  strategy_version:result.strategyVersion
 },{onConflict:"symbol,bucket_time"});
 if(saveError)throw new Error(`[Squeeze] 저장 실패: ${saveError.message}`);
 return{status:"ok",reason:null,result};
}
