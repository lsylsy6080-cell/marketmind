import { supabase } from "../lib/supabase";
import { impactLevel } from "./news-pipeline-utils";
import { translateNewsLocally } from "./local-korean-translator";

interface PendingRow {
  id:number;
  source:string;
  title:string;
  summary:string|null;
  ai_summary:string|null;
  sentiment:"bullish"|"neutral"|"bearish"|null;
  importance:number|null;
  relevance_score:number|null;
  published_at:string;
  raw_data:Record<string,unknown>|null;
}

export async function editPendingNewsToKorean(limit=5):Promise<{completed:number;failed:number;skipped:number}>{
  if(process.env.NEWS_KOREAN_EDITOR_ENABLED==="false") return {completed:0,failed:0,skipped:0};

  const batchLimit=Math.max(1,Math.min(10,Number(process.env.NEWS_TRANSLATION_BATCH_SIZE ?? limit) || 5));
  const {data,error}=await supabase.from("news_articles")
    .select("id,source,title,summary,ai_summary,sentiment,importance,relevance_score,published_at,raw_data")
    .eq("asset","BTC")
    .eq("analysis_status","completed")
    .in("translation_status",["pending","failed","reprocess"])
    .eq("is_duplicate",false)
    .order("published_at",{ascending:false})
    .limit(batchLimit);

  if(error) throw new Error(`[뉴스한글화] 조회 실패: ${error.message}`);

  let completed=0,failed=0,skipped=0;
  for(const row of (data??[]) as PendingRow[]){
    try{
      const edited=await translateNewsLocally({
        title:row.title,
        summary:row.ai_summary ?? row.summary,
      });
      const relevance=Number(row.relevance_score??0);
      const importance=Number(row.importance??5);
      const {error:updateError}=await supabase.from("news_articles").update({
        localized_title:edited.title,
        localized_summary:edited.summary,
        translation_status:"completed",
        translated_at:new Date().toISOString(),
        impact_level:impactLevel(importance,relevance),
        raw_data:{
          ...(row.raw_data??{}),
          korean_editor_model:process.env.NEWS_LOCAL_TRANSLATION_MODEL ?? "Xenova/nllb-200-distilled-600M",
          korean_editor_version:"marketmind-local-nllb-v2",
          korean_editor_cost:"free-local",
        },
      }).eq("id",row.id);
      if(updateError) throw new Error(updateError.message);
      completed++;
    }catch(error:unknown){
      failed++;
      const message=error instanceof Error?error.message:String(error);
      console.error(`[뉴스한글화-로컬] id=${row.id} 실패: ${message}`);
      const {error:updateError}=await supabase.from("news_articles")
        .update({translation_status:"failed"}).eq("id",row.id);
      if(updateError) console.error(`[뉴스한글화] 실패상태 저장 오류: ${updateError.message}`);
    }
  }

  console.log(`[뉴스한글화-로컬] 완료=${completed} 실패=${failed} · API 비용=0원 · batch=${batchLimit}`);
  return {completed,failed,skipped};
}
