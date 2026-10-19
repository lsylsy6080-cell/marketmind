import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,must,paperFixture} from './helpers';

test('original engines: Funding → News → ETF → Intelligence → AI → Paper → strategy evaluation',async()=>{
 const{db}=await testDatabase();
 process.env.PGDATABASE='marketmind_test';
 const{database}=await import('../../src/lib/database');
 const query=database.pool.query.bind(database.pool);
 database.pool.query=(...args:any[])=>db.pool.query(...args);
 const originalFetch=globalThis.fetch;
 const now=Date.now();
 globalThis.fetch=async(input:any)=>{
  const url=String(input);
  if(url.includes('premiumIndex'))return Response.json({symbol:'BTCUSDT',markPrice:'80000',indexPrice:'80000',lastFundingRate:'-0.0001',nextFundingTime:now+3600000,time:now});
  if(url.includes('/api/v3/klines')) { const start=Number(new URL(url).searchParams.get('startTime'));return Response.json([[start,'80000','80100','79900','80050','100',start+59999]]); }
  if(url.includes('ticker/price'))return Response.json({price:'80000'});
  if(url.includes('r.jina.ai/')){
   const date=new Date(now).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
   return new Response(`<table><tr><th>Date</th><th>IBIT</th><th>Total</th></tr><tr><td>${date}</td><td>100.5</td><td>100.5</td></tr></table>`);
  }
  throw new Error('Unexpected outbound request in offline integration test');
 };
 try{
 const rows=[];for(const marketType of ['spot','futures'])for(const timeframe of ['1m','5m','15m','1h','4h','1d','1w'])for(let i=0;i<500;i++){
  const price=78000+i*4+Math.sin(i/12)*30;const open=new Date(now-(501-i)*60000).toISOString();
  rows.push({exchange:'binance',market_type:marketType,symbol:'BTCUSDT',timeframe,open_time:open,close_time:open,open:price,high:price+25,low:price-25,close:price+5,volume:100+i%11,quote_volume:8000000,trade_count:100,taker_buy_base_volume:60,taker_buy_quote_volume:4800000,is_closed:true});
 }
 await must(db.from('market_candles').upsert(rows,{onConflict:'exchange,market_type,symbol,timeframe,open_time'}));
 await(await import('../../src/analyzers/btc-technical')).analyzeBtcTechnical();
 await(await import('../../src/analyzers/btc-market-score')).generateBtcMarketScore();
 await(await import('../../src/funding/generate-btc-funding-snapshot')).generateBtcFundingSnapshot();
 await(await import('../../src/news/collect-news')).collectBtcNews({parseFeed:async()=>({title:'Fixture',items:Array.from({length:8},(_,i)=>({title:`Bitcoin ETF institutional inflows increase ${i}`,link:`https://example.test/news/${i}`,contentSnippet:'Bitcoin ETF approval institutional adoption',isoDate:new Date(now-i*60000).toISOString()}))}) as any});
 await(await import('../../src/news/analyze-news-rules')).analyzePendingBtcNewsByRules();
 await(await import('../../src/news/btc-news-score')).generateBtcNewsScore();
 await(await import('../../src/news/btc-news-intelligence-v2')).enrichLatestBtcNewsScore();
 const etf=await(await import('../../src/etf/collector')).runEtfCollector();assert.equal(etf.saved,1);
 await(await import('../../src/intelligence/generate-market-intelligence')).generateMarketIntelligence();
 assert.equal((await(await import('../../src/intelligence/repository')).loadLatestMarketComponents()).find(c=>c.name==='etf')?.isFresh,true);
 await(await import('../../src/final/generate-final-market-decision')).generateFinalMarketDecision();
 await(await import('../../src/regime/run-market-regime-v2')).runMarketRegimeV2();
 await(await import('../../src/decision-v2/run-decision-v2')).runDecisionV2();
 const structure=await(await import('../../src/phase8-market-structure/run-phase8-market-structure')).runPhase81MarketStructure();
 const correlation=await(await import('../../src/phase8-correlation/run-phase8-correlation')).runPhase82Correlation();
 await(await import('../../src/phase8-context/run-phase8-market-context')).runPhase83MarketContext({structure,correlation});
 await(await import('../../src/phase8-decision-gate/run-phase8-context-decision-gate')).runPhase84ContextDecisionGate();
 await(await import('../../src/phase8-activation/run-phase8-context-activation')).runPhase85ContextActivation();
 await(await import('../../src/phase8-execution-guard/run-phase8-context-execution-guard')).runPhase86ContextExecutionGuard('long');
 await(await import('../../src/phase8-performance/run-phase8-context-performance')).runPhase88ContextPerformance();
 await(await import('../../src/phase8-promotion/run-phase8-safety-promotion')).runPhase89SafetyPromotion();
 await(await import('../../src/phase8-tuning/run-phase8-adaptive-context-tuning')).runPhase810AdaptiveContextTuning();
 await(await import('../../src/phase8-rollback/run-phase8-auto-rollback-protection')).runPhase811AutoRollbackProtection();
 for(const table of ['technical_snapshots','market_scores','funding_snapshots','news_articles','news_scores','etf_flow_snapshots','etf_flow_details','etf_scores','market_intelligence_scores','final_market_decisions','market_regime_snapshots','ai_decision_v2_snapshots'])assert.ok((await must<any[]>(db.from(table).select())).length>0,table);
 await paperFixture(db);
 const paper=await(await import('../../src/paper/run-paper-trading-worker')).runPaperTradingWorker();assert.equal(paper.failed,0);assert.ok(paper.total>0);
 await(await import('../../src/optimization/run-strategy-performance-analyzer')).runStrategyPerformanceAnalyzer();
 assert.ok((await must<any[]>(db.from('strategy_performance_snapshots').select())).length);
 // Mature historical decisions make evaluation exercise persistence, not just empty-data branches.
 for(let i=0;i<45;i++){
  const d=await must<any>(db.from('final_market_decisions').insert({symbol:'BTCUSDT',decided_at:new Date(now-(i+2)*86400000).toISOString(),final_score:i%2?75:25,final_confidence:85,direction:i%2?'bullish':'bearish',action:i%2?'buy':'sell',trading_permission:'allowed',risk_level:'normal',strategy_version:'fixture'}).select().single());
  await must(db.from('final_market_backtests').insert({decision_id:d.id,symbol:'BTCUSDT',entry_time:d.decided_at,entry_price:80000,status:'completed',return_24h:i%2?2:-1}));
 }
 const matured=await must<any>(db.from('final_market_decisions').insert({symbol:'BTCUSDT',decided_at:new Date(now-40*3600000).toISOString(),final_score:75,final_confidence:85,direction:'bullish',action:'buy',trading_permission:'allowed',risk_level:'normal',strategy_version:'fixture'}).select().single());
 await(await import('../../src/backtest/run-final-market-backtests')).runFinalMarketBacktests();
 const evaluated=await must<any>(db.from('final_market_backtests').select().eq('decision_id',matured.id).single());assert.equal(evaluated.status,'completed');assert.ok(evaluated.price_24h);
 await(await import('../../src/performance/run-performance-engine')).runPerformanceEngine();
 const observations=await(await import('../../src/optimization/run-strategy-candidate-comparison')).runStrategyCandidateComparison();
 const validation=await(await import('../../src/optimization/run-strategy-walk-forward-validation')).runStrategyWalkForwardValidation(observations);
 await(await import('../../src/optimization/run-strategy-recommendation')).runStrategyRecommendation(validation);
 await(await import('../../src/optimization/run-optimization-readiness')).runOptimizationReadiness();
 for(const table of ['final_market_performance','strategy_candidate_comparisons','strategy_validation_results','strategy_recommendations','strategy_optimization_status'])assert.ok((await must<any[]>(db.from(table).select())).length>0,table);
 }finally{globalThis.fetch=originalFetch;database.pool.query=query;await database.close();await db.close();}
});
