import "dotenv/config";
import {supabase} from "../lib/supabase";
import {buildEstimatedLiquidationMap} from "./EstimatedLiquidationMapEngine";

export async function runEstimatedLiquidationMap(){
  const {data:mapRow,error:mapError}=await supabase
    .from("position_cluster_maps")
    .select("id,current_price,clusters,calculated_at")
    .eq("symbol","BTCUSDT")
    .order("calculated_at",{ascending:false})
    .limit(1)
    .maybeSingle();

  if(mapError)throw new Error(`[Liquidation Map] source map 조회 실패: ${mapError.message}`);
  if(!mapRow)return{status:"warming_up",reason:"Position Cluster Map이 아직 없습니다.",map:null};

  const clusters=Array.isArray(mapRow.clusters)?mapRow.clusters:[];
  if(!clusters.length)return{
    status:"warming_up",
    reason:"Position Cluster가 아직 생성되지 않았습니다.",
    map:null,
  };

  const map=buildEstimatedLiquidationMap({
    currentPrice:Number(mapRow.current_price),
    clusters:clusters.map((c:any)=>({
      centerPrice:Number(c.centerPrice),
      longIntensity:Number(c.longIntensity??0),
      shortIntensity:Number(c.shortIntensity??0),
      confidence:Number(c.confidence??0),
      estimatedNewLongOiUsd:Number(c.estimatedNewLongOiUsd??0),
      estimatedNewShortOiUsd:Number(c.estimatedNewShortOiUsd??0),
    })),
    sourceMapId:Number(mapRow.id),
  });

  const bucket=new Date(Math.floor(Date.now()/60_000)*60_000).toISOString();
  const {data:inserted,error:saveError}=await supabase
    .from("estimated_liquidation_maps")
    .upsert({
      symbol:"BTCUSDT",
      bucket_time:bucket,
      calculated_at:map.calculatedAt,
      current_price:map.currentPrice,
      source_position_cluster_map_id:map.sourceMapId,
      maintenance_margin_rate:map.maintenanceMarginRate,
      leverage_distribution:map.leverageDistribution,
      nearest_long_zone:map.nearestLongZone,
      nearest_short_zone:map.nearestShortZone,
      strongest_long_zone:map.strongestLongZone,
      strongest_short_zone:map.strongestShortZone,
      long_zones:map.longZones,
      short_zones:map.shortZones,
      strategy_version:map.strategyVersion,
    },{onConflict:"symbol,bucket_time"})
    .select("id")
    .single();

  if(saveError)throw new Error(`[Liquidation Map] map 저장 실패: ${saveError.message}`);

  if(inserted?.id){
    await supabase.from("estimated_liquidation_levels").delete().eq("map_id",inserted.id);
    const levels=[...map.longZones,...map.shortZones];
    if(levels.length){
      const {error:levelError}=await supabase.from("estimated_liquidation_levels").insert(
        levels.map(z=>({
          map_id:inserted.id,
          symbol:"BTCUSDT",
          calculated_at:map.calculatedAt,
          side:z.side,
          price_low:z.priceLow,
          price_high:z.priceHigh,
          center_price:z.centerPrice,
          distance_from_current_percent:z.distanceFromCurrentPercent,
          intensity:z.intensity,
          confidence:z.confidence,
          estimated_risk_usd:z.estimatedRiskUsd,
          source_cluster_count:z.sourceClusterCount,
          contributing_cluster_centers:z.contributingClusterCenters,
          leverage_mix:z.leverageMix,
        }))
      );
      if(levelError)throw new Error(`[Liquidation Map] level 저장 실패: ${levelError.message}`);
    }
  }

  return{status:"ok",reason:null,map};
}
