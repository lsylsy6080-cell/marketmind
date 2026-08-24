import "dotenv/config";
import {supabase} from "../lib/supabase";
import {buildPositionClusterMap} from "./PositionClusterEngine";
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};
export async function runPositionClusterMap(){
 const since=new Date(Date.now()-6*3600000).toISOString();
 const {data,error}=await supabase.from("global_futures_exchange_snapshots").select("exchange,fetched_at,last_price,open_interest_usd,taker_buy_ratio,available").gte("fetched_at",since).eq("available",true).order("fetched_at",{ascending:true}).limit(5000);
 if(error)throw new Error(`[Position Cluster] source 조회 실패: ${error.message}`);
 const rows=(data??[])
  .map((r:any)=>({
    exchange:String(r.exchange),
    fetchedAt:String(r.fetched_at),
    lastPrice:n(r.last_price),
    openInterestUsd:n(r.open_interest_usd),
    takerBuyRatio:n(r.taker_buy_ratio),
  }))
  .filter((r):r is {
    exchange:string;
    fetchedAt:string;
    lastPrice:number;
    openInterestUsd:number;
    takerBuyRatio:number|null;
  }=>r.lastPrice!==null&&r.openInterestUsd!==null);
 if(rows.length<2)return{status:"warming_up",reason:`Global Futures snapshot 표본 부족 (${rows.length})`,map:null};
 const latest=[...rows].sort((a,b)=>+new Date(b.fetchedAt)-+new Date(a.fetchedAt))[0];
 const map=buildPositionClusterMap({snapshots:rows,currentPrice:latest.lastPrice});
 const bucket=new Date(Math.floor(Date.now()/60000)*60000).toISOString();
 const {data:ins,error:saveError}=await supabase.from("position_cluster_maps").upsert({symbol:"BTCUSDT",bucket_time:bucket,calculated_at:map.calculatedAt,lookback_hours:map.lookbackHours,half_life_hours:map.halfLifeHours,current_price:map.currentPrice,bin_size_usd:map.binSizeUsd,total_estimated_new_long_oi_usd:map.totalEstimatedNewLongOiUsd,total_estimated_new_short_oi_usd:map.totalEstimatedNewShortOiUsd,strongest_long_cluster:map.strongestLongCluster,strongest_short_cluster:map.strongestShortCluster,source_exchange_count:map.sourceExchangeCount,source_snapshot_count:map.sourceSnapshotCount,clusters:map.clusters,strategy_version:map.strategyVersion},{onConflict:"symbol,bucket_time"}).select("id").single();
 if(saveError)throw new Error(`[Position Cluster] map 저장 실패: ${saveError.message}`);
 if(ins?.id){await supabase.from("position_cluster_levels").delete().eq("map_id",ins.id);if(map.clusters.length){const {error:e}=await supabase.from("position_cluster_levels").insert(map.clusters.map(c=>({map_id:ins.id,symbol:"BTCUSDT",calculated_at:map.calculatedAt,price_low:c.priceLow,price_high:c.priceHigh,center_price:c.centerPrice,distance_from_current_percent:c.distanceFromCurrentPercent,long_intensity:c.longIntensity,short_intensity:c.shortIntensity,dominant_side:c.dominantSide,confidence:c.confidence,estimated_new_long_oi_usd:c.estimatedNewLongOiUsd,estimated_new_short_oi_usd:c.estimatedNewShortOiUsd,exchange_count:c.exchangeCount,contributing_exchanges:c.contributingExchanges,sample_count:c.sampleCount})));if(e)throw new Error(`[Position Cluster] level 저장 실패: ${e.message}`)}}
 return{status:"ok",reason:null,map};
}
