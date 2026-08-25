import { supabase } from "../lib/supabase";
import { buildNewsDuplicateGroups } from "./news-dedupe";

interface Row {
  id:number;
  title:string;
  source:string;
  published_at:string;
  importance:number|null;
  relevance_score:number|null;
}

export async function markRecentNewsDuplicates(windowHours=48):Promise<{groups:number;duplicates:number}>{
  const cutoff=new Date(Date.now()-windowHours*3600_000).toISOString();
  const {data,error}=await supabase.from("news_articles")
    .select("id,title,source,published_at,importance,relevance_score")
    .eq("asset","BTC").gte("published_at",cutoff)
    .order("published_at",{ascending:false}).limit(300);
  if(error) throw new Error(`[뉴스중복] 조회 실패: ${error.message}`);
  const groups=buildNewsDuplicateGroups((data??[]) as Row[]);
  let duplicates=0;
  for(const group of groups){
    const sorted=[...group].sort((a,b)=>{
      const score=(x:Row)=>(Number(x.importance??0)*10)+(Number(x.relevance_score??0));
      return score(b)-score(a) || new Date(b.published_at).getTime()-new Date(a.published_at).getTime();
    });
    const canonical=sorted[0];
    await supabase.from("news_articles").update({is_duplicate:false,canonical_article_id:null}).eq("id",canonical.id);
    for(const duplicate of sorted.slice(1)){
      const {error:updateError}=await supabase.from("news_articles")
        .update({is_duplicate:true,canonical_article_id:canonical.id}).eq("id",duplicate.id);
      if(updateError) throw new Error(`[뉴스중복] 저장 실패: ${updateError.message}`);
      duplicates+=1;
    }
  }
  console.log(`[뉴스중복] ${groups.length}개 사건 그룹 · 중복 ${duplicates}건 표시`);
  return {groups:groups.length,duplicates};
}
