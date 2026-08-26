import { supabase } from "../lib/supabase";
import { impactLevel } from "./news-pipeline-utils";
import { createBitcoinFlash } from "./news-flash-editor";
import { buildFlashMismatchReport, formatFlashMismatchReport, type FlashMismatchDiagnostic } from "./news-flash-diagnostics";

interface PendingRow {
  id:number; source:string; title:string; summary:string|null; ai_summary:string|null;
  sentiment:"bullish"|"neutral"|"bearish"|null; importance:number|null;
  relevance_score:number|null; published_at:string; raw_data:Record<string,unknown>|null;
}

export async function editPendingNewsToKorean(limit=30):Promise<{completed:number;failed:number;skipped:number}>{
  const batchLimit=Math.max(1,Math.min(100,Number(process.env.NEWS_FLASH_BATCH_SIZE ?? limit)||30));
  const {data,error}=await supabase.from("news_articles")
    .select("id,source,title,summary,ai_summary,sentiment,importance,relevance_score,published_at,raw_data")
    .eq("asset","BTC").eq("analysis_status","completed")
    .in("translation_status",["pending","failed","reprocess"])
    .eq("is_duplicate",false).order("published_at",{ascending:false}).limit(batchLimit);
  if(error) throw new Error(`[뉴스속보] 조회 실패: ${error.message}`);

  let completed=0,failed=0,skipped=0;
  const mismatches: FlashMismatchDiagnostic[] = [];
  for(const row of (data??[]) as PendingRow[]){
    try{
      const flash=createBitcoinFlash(row.title,row.ai_summary??row.summary);
      const relevance=Number(row.relevance_score??0), importance=Number(row.importance??5);
      const {error:updateError}=await supabase.from("news_articles").update({
        localized_title:flash.headline,
        localized_summary:flash.summary,
        translation_status:"completed",
        translated_at:new Date().toISOString(),
        impact_level:impactLevel(importance,relevance),
        raw_data:{...(row.raw_data??{}),flash_editor_version:"marketmind-news-flash-v2.6",
          flash_category:flash.category,flash_confidence:flash.confidence,
          flash_extracted:flash.extracted,flash_editor_cost:"free"}
      }).eq("id",row.id);
      if(updateError) throw new Error(updateError.message);
      completed++;
      if(!flash.extracted) {
        skipped++;
        mismatches.push({
          id: row.id,
          source: row.source,
          title: row.title,
          category: flash.category,
        });
      }
    }catch(error:unknown){
      failed++;
      console.error(`[뉴스속보] id=${row.id} 실패: ${error instanceof Error?error.message:String(error)}`);
    }
  }
  console.log(`[뉴스속보V2.6] 완료=${completed} 패턴미일치=${skipped} 실패=${failed} · API 비용=0원`);
  const report = buildFlashMismatchReport(mismatches, 30);
  for (const line of formatFlashMismatchReport(report)) console.log(line);
  return {completed,failed,skipped};
}
