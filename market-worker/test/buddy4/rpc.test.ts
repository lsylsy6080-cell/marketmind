import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase,must,paperFixture} from './helpers';

test('worker lock ownership, expiry and stale-run cleanup',async()=>{
 const{db,engine}=await testDatabase();try{
 const a=randomUUID(),b=randomUUID(),worker='fixture';
 const args={p_worker_name:worker,p_run_id:a,p_ttl_seconds:300};
 assert.equal(await must(db.rpc('acquire_worker_lock_v2',args)),true);
 assert.equal(await must(db.rpc('acquire_worker_lock_v2',{...args,p_run_id:b})),false);
 assert.equal(await must(db.rpc('heartbeat_worker_lock_v2',{...args,p_run_id:b})),false);
 assert.equal(await must(db.rpc('release_worker_lock_v2',{p_worker_name:worker,p_run_id:b})),false);
 await must(db.from('worker_execution_runs').insert({run_id:a,worker_name:worker,status:'running',started_at:'2020-01-01'}));
 assert.equal(await must(db.rpc('mark_stale_worker_runs_v1',{p_worker_name:worker,p_stale_minutes:10})),0);
 await engine.query('update public.worker_execution_locks set locked_until=now()-interval \'1 second\'');
 assert.equal(await must(db.rpc('heartbeat_worker_lock_v2',args)),false);
 assert.equal(await must(db.rpc('mark_stale_worker_runs_v1',{p_worker_name:worker,p_stale_minutes:10})),1);
 assert.equal(await must(db.rpc('acquire_worker_lock_v2',{...args,p_run_id:b})),true);
 assert.equal(await must(db.rpc('release_worker_lock_v2',{p_worker_name:worker,p_run_id:b})),true);
 }finally{await db.close();}
});

for(const side of ['long','short'])test(`paper ${side}: accounting, duplicates, rollback and parallel close`,async()=>{
 const{db}=await testDatabase();try{
 const f=await paperFixture(db,side);
 const args={p_account_id:f.account.id,p_config_id:f.config.id,p_decision_id:f.decision.id,p_market_price:100};
 const opens=await Promise.all([must<any>(db.rpc('paper_open_position_v1',args)),must<any>(db.rpc('paper_open_position_v1',args))]);
 assert.equal(opens.filter(r=>r.status==='opened').length,1);
 const position=opens.find(r=>r.status==='opened')!;
 const afterOpen=await must<any>(db.from('paper_trading_accounts').select().eq('id',f.account.id).single());
 assert.ok(Math.abs(Number(afterOpen.cash_balance)-9000)<1e-6);
 const invalid=await db.rpc('paper_close_position_v1',{p_position_id:position.position_id,p_market_price:-1,p_close_reason:'manual'});assert.ok(invalid.error);
 assert.equal(Number((await must<any>(db.from('paper_trading_accounts').select().eq('id',f.account.id).single())).cash_balance),Number(afterOpen.cash_balance));
 const price=side==='long'?110:90;
 const closes=await Promise.all([must<any>(db.rpc('paper_close_position_v1',{p_position_id:position.position_id,p_market_price:price,p_close_reason:'take_profit'})),must<any>(db.rpc('paper_close_position_v1',{p_position_id:position.position_id,p_market_price:price,p_close_reason:'take_profit'}))]);
 assert.equal(closes.filter(r=>r.status==='closed').length,1);
 const trade=await must<any>(db.from('paper_trades').select().single());
 const account=await must<any>(db.from('paper_trading_accounts').select().eq('id',f.account.id).single());
 assert.ok(Number(trade.net_pnl)>0);assert.ok(Math.abs(Number(account.cash_balance)-10000-Number(trade.net_pnl))<1e-6);
 assert.ok(Math.abs(Number(account.total_fees)-Number(trade.fees))<1e-6);
 assert.equal((await must<any[]>(db.from('paper_strategy_comparison_v1').select()))[0].total_trades,1);
 }finally{await db.close();}
});

test('adaptive execution: plan validation, parallel entry/exit and margin/fee conservation',async()=>{
 const{db}=await testDatabase();try{
 const f=await paperFixture(db);
 const score=await must<any>(db.from('market_scores').insert({symbol:'BTCUSDT',analyzed_at:new Date().toISOString(),strategy_version:'test'}).select().single());
 const news=await must<any>(db.from('news_scores').insert({symbol:'BTCUSDT'}).select().single());
 const funding=await must<any>(db.from('funding_snapshots').insert({symbol:'BTCUSDT',fetched_at:new Date().toISOString(),funding_rate:0,funding_rate_percent:0,annualized_rate_percent:0,mark_price:100,index_price:100,score:50,confidence:90,direction:'neutral',risk_level:'normal',trading_permission:'allowed',strategy_version:'test'}).select().single());
 const regime=await must<any>(db.from('market_regime_snapshots').insert({symbol:'BTCUSDT',bucket_time:new Date().toISOString(),strategy_version:'test'}).select().single());
 const decision=await must<any>(db.from('ai_decision_v2_snapshots').insert({symbol:'BTCUSDT',technical_score_id:score.id,news_score_id:news.id,funding_score_id:funding.id,regime_snapshot_id:regime.id,strategy_version:'test',direction:'bullish',trading_permission:'allowed',entry_trigger:{status:'READY'}}).select().single());
 const sizing=await must<any>(db.from('adaptive_position_sizing_snapshots').insert({symbol:'BTCUSDT',decision_v2_id:decision.id,strategy_version:'test',sizing_status:'candidate_ready',margin_percent:10,leverage:2}).select().single());
 const account=await must<any>(db.from('adaptive_paper_accounts').insert({base_account_id:f.account.id,initial_balance:10000,cash_balance:10000}).select().single());
 const args={p_account_id:account.id,p_base_config_id:f.config.id,p_symbol:'BTCUSDT',p_side:'long',p_decision_v2_id:decision.id,p_sizing_snapshot_id:sizing.id,p_entry_price:100,p_stop_loss_price:98,p_take_profit_price:104,p_margin_percent:10,p_leverage:2,p_margin_amount:1000,p_notional_amount:2000,p_quantity:20,p_entry_fee:0.8,p_risk_reward_ratio:2,p_expected_stop_loss_amount:40};
 assert.ok((await db.rpc('adaptive_paper_open_position_v1',{...args,p_quantity:200})).error);
 const opens=await Promise.all([must<any>(db.rpc('adaptive_paper_open_position_v1',args)),must<any>(db.rpc('adaptive_paper_open_position_v1',args))]);
 assert.equal(opens.filter(r=>r.status==='opened').length,1);
 const p=opens.find(r=>r.status==='opened')!;
 const close={p_position_id:p.position_id,p_market_price:110,p_close_reason:'take_profit',p_fee_rate_percent:0.04};
 const closes=await Promise.all([must<any>(db.rpc('adaptive_paper_close_position_v1',close)),must<any>(db.rpc('adaptive_paper_close_position_v1',close))]);
 assert.equal(closes.filter(r=>r.status==='closed').length,1);
 const result=await must<any>(db.from('adaptive_paper_accounts').select().eq('id',account.id).single());
 assert.equal(Number(result.reserved_margin),0);assert.ok(Math.abs(Number(result.cash_balance)-10198.32)<1e-6);assert.ok(Math.abs(Number(result.total_fees)-1.68)<1e-6);
 const trade=await must<any>(db.from('adaptive_paper_trades').select().single());assert.ok(Math.abs(Number(trade.return_on_equity_percent)-1.9832)<1e-6);
 const {buildAdaptiveExecutionPlan}=await import('../../src/adaptive-paper/AdaptiveExecutionEngine');
 const plan=buildAdaptiveExecutionPlan({side:'long',marketPrice:80000.12345678,invalidationPrice:79000,marginPercent:10,leverage:2,accountEquity:Number(result.cash_balance)});
 const rounded=await must<any>(db.rpc('adaptive_paper_open_position_v1',{...args,p_entry_price:plan.entryPrice,p_stop_loss_price:plan.stopLossPrice,p_take_profit_price:plan.takeProfitPrice,p_margin_amount:plan.marginAmount,p_notional_amount:plan.notionalAmount,p_quantity:plan.quantity,p_entry_fee:plan.entryFee,p_risk_reward_ratio:plan.riskRewardRatio,p_expected_stop_loss_amount:plan.expectedStopLossAmount}));
 assert.equal(rounded.status,'opened','rounded BTC-sized plan must be accepted');
 await must(db.rpc('adaptive_paper_close_position_v1',{...close,p_position_id:rounded.position_id,p_market_price:1,p_close_reason:'stop_loss'}));
 const bankrupt=await must<any>(db.from('adaptive_paper_accounts').select().eq('id',account.id).single());assert.ok(Number(bankrupt.cash_balance)>=0);assert.equal(Number(bankrupt.reserved_margin),0);

 }finally{await db.close();}
});
