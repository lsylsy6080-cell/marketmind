import "dotenv/config";
import { collectBtcNews } from "../src/news/collect-news";
import { analyzePendingBtcNewsByRules } from "../src/news/analyze-news-rules";
import { markRecentNewsDuplicates } from "../src/news/news-dedupe-worker";
import { editPendingNewsToKorean } from "../src/news/korean-news-editor";
import { generateBtcNewsScore } from "../src/news/btc-news-score";
import { enrichLatestBtcNewsScore } from "../src/news/btc-news-intelligence-v2";

async function main(){
  console.log("[News Pipeline v1] 시작");
  await collectBtcNews();
  await analyzePendingBtcNewsByRules(50);
  await markRecentNewsDuplicates(48);
  await editPendingNewsToKorean(20);
  await generateBtcNewsScore(24);
  await enrichLatestBtcNewsScore();
  console.log("[News Pipeline v1] 완료");
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
