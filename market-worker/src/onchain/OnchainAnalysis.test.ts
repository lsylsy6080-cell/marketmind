import assert from 'node:assert/strict';
import { analyzeOnchain,finite,freshMetric } from './OnchainAnalysis';
import type { MetricValue } from './types';
const now=new Date('2026-10-08T09:00:00Z');
const metric=(value:number|null,observed_at='2026-10-07T00:00:00Z'):MetricValue=>({value,observed_at,unit:'test',source:'fixture'});
function test(label:string,run:()=>void){run();console.log('[PASS]',label)}
test('null, blank and NaN are absent; a real zero stays zero',()=>{for(const x of [null,undefined,'',NaN,Infinity,false])assert.equal(finite(x),null);assert.equal(finite(0),0)});
test('no usable data has no score, no confidence and neutral direction',()=>assert.deepEqual(analyzeOnchain({},now),{...analyzeOnchain({},now),onchain_score:null,onchain_confidence:0,direction:'neutral'}));
test('stale and future observations are excluded',()=>{assert.equal(freshMetric(metric(1,'2026-10-01T00:00:00Z'),now),null);assert.equal(freshMetric(metric(1,'2026-10-09T00:00:00Z'),now),null)});
test('fees and hashrate alone cannot imply a buy or sell signal',()=>{const r=analyzeOnchain({fee_fast:metric(100),hash_rate_eh:metric(1000)},now);assert.equal(r.onchain_score,null)});
test('outflows and lower MVRV improve background score with limited confidence',()=>{const r=analyzeOnchain({mvrv:metric(1),exchange_netflow_btc:metric(-10000),exchange_balance_btc:metric(2000000),active_addresses_change_7d_pct:metric(20)},now);assert.equal(r.direction,'bullish');assert.equal(r.onchain_confidence,60);assert(r.onchain_score!==null&&r.onchain_score>57)});
test('inflows and high MVRV weaken background score',()=>{const r=analyzeOnchain({mvrv:metric(4),exchange_netflow_btc:metric(10000),exchange_balance_btc:metric(2000000),active_addresses_change_7d_pct:metric(-20)},now);assert.equal(r.direction,'bearish')});
test('missing reserves exclude the flow signal, rather than invent a denominator',()=>{const r=analyzeOnchain({exchange_netflow_btc:metric(1000)},now);assert.equal(r.onchain_score,null)});
test('partial coverage never gets full confidence and scores remain bounded',()=>{const r=analyzeOnchain({active_addresses_change_7d_pct:metric(100000)},now);assert.equal(r.onchain_score,100);assert.equal(r.onchain_confidence,20)});

async function collectorChecks() {
  const {collectOnchain}=await import('./collect-onchain');
  const originalFetch=globalThis.fetch;
  const keys=['AdrActCnt','FlowInExNtv','FlowOutExNtv','SplyExNtv'];
  globalThis.fetch=async(input)=>{
    const url=String(input);
    let body:unknown={};
    if(url.includes('/catalog/')) body={data:keys.map(metric=>({metric,full_name:metric,unit:'test',frequencies:[{frequency:'1d',assets:['btc']}]}))};
    else if(url.includes('/timeseries/')) body={data:[{time:'2026-10-07T00:00:00Z',AdrActCnt:'100',FlowInExNtv:'100',FlowOutExNtv:'50',SplyExNtv:'1000'},{time:'2026-10-08T00:00:00Z',AdrActCnt:null,FlowInExNtv:null,FlowOutExNtv:null,SplyExNtv:null}]};
    else if(url.includes('stats?')) body={timestamp:now.getTime()-60000,n_btc_mined:312500000,total_fees_btc:-312500000,miners_revenue_btc:0};
    else if(url.includes('/fees/recommended')) return new Response('{}',{status:503});
    else if(url.includes('/charts/')) body={unit:'test',values:[{x:now.getTime()/1000-86400,y:123}],name:'fixture'};
    else if(url.includes('/hashrate/')) body={currentHashrate:1e21,currentDifficulty:100};
    else if(url.includes('/api/mempool')) body={count:0,vsize:0,total_fee:0};
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  };
  try {
    const s=await collectOnchain(now);
    test('collector preserves last non-null provider day rather than incomplete current day',()=>assert.equal(s.metrics.active_addresses.observed_at,'2026-10-07T00:00:00Z'));
    test('one source failure cannot discard other providers or valid zero mempool count',()=>{assert.equal(s.sources.mempool_fees.ok,false);assert.equal(s.sources.coinmetrics.ok,true);assert.equal(s.metrics.mempool_tx_count.value,0)});
    test('source unit conversion and invalid mining values',()=>{assert.equal(s.metrics.bc_issuance_btc.value,3.125);assert.equal(s.metrics.bc_fees_total_btc.value,null);assert.equal(s.metrics.miner_revenue_btc.value,null);assert.equal(s.metrics.hash_rate_eh.value,1000)});
    test('same-interval exchange subtraction and raw source retention',()=>{assert.equal(s.metrics.exchange_netflow_btc.value,50);assert(s.raw_data.coinmetrics);assert(s.raw_data.blockchain)});
  } finally {globalThis.fetch=originalFetch;}
}
collectorChecks().catch(e=>{console.error(e);process.exitCode=1});
