import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const isObject=(value:unknown):value is Row=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const num=(value:unknown,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const list=(value:unknown)=>Array.isArray(value)?value:[];

function normalizeLevel(value:unknown){
 const row=isObject(value)?value:{};
 const price=num(row.price);
 return {
  price,zoneLow:num(row.zoneLow??row.zone_low,price),zoneHigh:num(row.zoneHigh??row.zone_high,price),
  strength:num(row.strength),grade:String(row.grade??"C"),status:String(row.status??"active"),
  distancePercent:num(row.distancePercent??row.distance_percent),kind:String(row.kind??"support"),
  sources:list(row.sources).map(String),timeframes:list(row.timeframes).map(String),touchCount:num(row.touchCount??row.touch_count),
  rejectionPercent:num(row.rejectionPercent??row.rejection_percent),lastTouchedAt:row.lastTouchedAt??row.last_touched_at??null,
  roleFlipCount:num(row.roleFlipCount??row.role_flip_count),reasons:list(row.reasons).map(String),scoreBreakdown:isObject(row.scoreBreakdown)?row.scoreBreakdown:isObject(row.score_breakdown)?row.score_breakdown:{}
 };
}

export async function GET(){
 const checkedAt=new Date().toISOString();
 try{
  const supabase=createAdminClient();
  const {data,error}=await supabase.from("market_structure_snapshots").select("calculated_at,current_price,support_levels,resistance_levels,strategy_version").eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)return NextResponse.json({ok:false,checkedAt,current:null},{headers:{"Cache-Control":"no-store, max-age=0"}});
  return NextResponse.json({ok:true,checkedAt,current:{calculatedAt:data.calculated_at,currentPrice:num(data.current_price),supportLevels:list(data.support_levels).map(normalizeLevel),resistanceLevels:list(data.resistance_levels).map(normalizeLevel),strategyVersion:data.strategy_version}},{headers:{"Cache-Control":"no-store, max-age=0"}});
 }catch(error){
  return NextResponse.json({ok:false,checkedAt,current:null,error:error instanceof Error?error.message:"매물대 데이터를 불러오지 못했습니다."},{status:200,headers:{"Cache-Control":"no-store, max-age=0"}});
 }
}
