import OpenAI from "openai";
import { supabase } from "../lib/supabase";
import { impactLevel } from "./news-pipeline-utils";

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

type Edited={title:string;summary:string};

function parseEditorJson(text:string):Edited{
  const cleaned=text.trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
  const value=JSON.parse(cleaned) as Partial<Edited>;
  const title=String(value.title??"").trim();
  const summary=String(value.summary??"").trim();
  if(!title||!summary) throw new Error("번역 응답 title/summary 누락");
  return {title:title.slice(0,180),summary:summary.slice(0,900)};
}

export async function editPendingNewsToKorean(limit=20):Promise<{completed:number;failed:number;skipped:number}>{
  if(process.env.NEWS_KOREAN_EDITOR_ENABLED==="false") return {completed:0,failed:0,skipped:0};
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey){
    console.log("[뉴스한글화] OPENAI_API_KEY 없음 · 한글 편집 단계만 건너뜁니다.");
    return {completed:0,failed:0,skipped:0};
  }
  const client=new OpenAI({apiKey});
  const model=process.env.NEWS_EDITOR_MODEL ?? "gpt-4.1-mini";
  const {data,error}=await supabase.from("news_articles")
    .select("id,source,title,summary,ai_summary,sentiment,importance,relevance_score,published_at,raw_data")
    .eq("asset","BTC").eq("analysis_status","completed").in("translation_status",["pending","failed"])
    .eq("is_duplicate",false).order("published_at",{ascending:false}).limit(limit);
  if(error) throw new Error(`[뉴스한글화] 조회 실패: ${error.message}`);
  let completed=0,failed=0,skipped=0;
  for(const row of (data??[]) as PendingRow[]){
    try{
      const response=await client.responses.create({
        model,
        input:[{
          role:"user",
          content:`다음 암호화폐 뉴스를 한국 투자자가 빠르게 읽을 수 있는 속보 형식으로 편집해. 사실을 추가하거나 추측하지 마.\n\n요구사항:\n- title: 자연스러운 한국어 뉴스 헤드라인 1줄. 직역투 금지.\n- summary: 원문이 지지하는 핵심 사실만 2~3문장. 투자 권유 금지.\n- 숫자, 기관명, 인물명은 원문 의미 유지.\n- JSON만 출력: {"title":"...","summary":"..."}\n\n출처: ${row.source}\n영문 제목: ${row.title}\n원문 요약: ${row.summary??""}\n기존 분석 요약: ${row.ai_summary??""}`
        }],
      });
      const edited=parseEditorJson(response.output_text);
      const relevance=Number(row.relevance_score??0);
      const importance=Number(row.importance??5);
      const {error:updateError}=await supabase.from("news_articles").update({
        localized_title:edited.title,
        localized_summary:edited.summary,
        translation_status:"completed",
        translated_at:new Date().toISOString(),
        impact_level:impactLevel(importance,relevance),
        raw_data:{...(row.raw_data??{}),korean_editor_model:model,korean_editor_version:"marketmind-news-editor-v1"},
      }).eq("id",row.id);
      if(updateError) throw new Error(updateError.message);
      completed++;
    }catch(error:unknown){
      failed++;
      const message=error instanceof Error?error.message:String(error);
      console.error(`[뉴스한글화] id=${row.id} 실패: ${message}`);
      const {error:updateError}=await supabase.from("news_articles").update({translation_status:"failed"}).eq("id",row.id);
      if(updateError) console.error(`[뉴스한글화] 실패상태 저장 오류: ${updateError.message}`);
    }
  }
  console.log(`[뉴스한글화] 완료=${completed} 실패=${failed} 건너뜀=${skipped}`);
  return {completed,failed,skipped};
}
