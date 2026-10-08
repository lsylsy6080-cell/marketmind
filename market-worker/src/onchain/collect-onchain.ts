import { analyzeOnchain, finite } from './OnchainAnalysis';
import { DAILY_MAX_AGE_MS, ONCHAIN_VERSION, type MetricValue, type OnchainSnapshot, type SourceStatus } from './types';

type Row = Record<string, unknown>;
type CatalogEntry = { metric: string; full_name: string; unit: string; frequencies: { frequency: string; assets: string[] }[] };
let catalogCache: { at: number; entries: CatalogEntry[] } | null = null;
async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json', 'user-agent': 'MarketMind-Onchain/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).hostname}`);
  return r.json() as Promise<T>;
}
async function catalog(): Promise<CatalogEntry[]> {
  if (catalogCache && Date.now() - catalogCache.at < 86400_000) return catalogCache.entries;
  const response = await json<{ data: CatalogEntry[]; next_page_url?: string }>('https://community-api.coinmetrics.io/v4/catalog/asset-metrics');
  if (response.next_page_url) throw new Error('Coin Metrics catalog pagination changed; refusing incomplete metric discovery');
  const entries = response.data.filter(x => x.frequencies.some(f => f.frequency === '1d' && f.assets.includes('btc')));
  if (!entries.length) throw new Error('No free BTC daily metrics in catalog');
  catalogCache = { at: Date.now(), entries };
  return entries;
}
export async function collectOnchain(now = new Date()): Promise<OnchainSnapshot> {
  const metrics: Record<string, MetricValue> = {};
  const raw_data: Record<string, unknown> = {};
  const sources: Record<string, SourceStatus> = {};
  const at = now.toISOString();
  const put = (key: string, value: unknown, unit: string, source: string, observed_at = at) => {
    metrics[key] = { value: finite(value), unit, source, observed_at };
  };
  async function source(name: string, work: () => Promise<void>) {
    const before = Object.keys(metrics).length;
    try { await work(); sources[name] = { ok: true, fetched_at: at, error: null, metric_count: Object.keys(metrics).length - before }; }
    catch (e) { sources[name] = { ok: false, fetched_at: at, error: e instanceof Error ? e.message : String(e), metric_count: 0 }; }
  }
  // Sequential sources keep request concurrency and public API load bounded.
  await source('coinmetrics', async () => {
    const entries = await catalog();
    const url = new URL('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics');
    url.search = new URLSearchParams({ assets: 'btc', metrics: entries.map(x => x.metric).join(','), frequency: '1d', page_size: '100', start_time: new Date(now.getTime() - 40 * 86400_000).toISOString().slice(0, 10) }).toString();
    const response = await json<{ data: Row[]; next_page_url?: string }>(url.toString());
    if (response.next_page_url) throw new Error('Coin Metrics history exceeded bounded page size');
    const rows = response.data.sort((a,b) => Date.parse(String(a.time)) - Date.parse(String(b.time)));
    raw_data.coinmetrics = { catalog: entries, days: rows };
    for (const entry of entries) {
      const row = [...rows].reverse().find(x => finite(x[entry.metric]) !== null && !String(x[`${entry.metric}-status`] ?? '').match(/invalid|error/i));
      put(`cm_${entry.metric}`, row?.[entry.metric] ?? null, entry.unit, 'coinmetrics', row ? String(row.time) : at);
    }
    const aliases: Record<string,string> = { active_addresses:'AdrActCnt', address_balance_count:'AdrBalCnt', transactions_24h:'TxCnt', transfer_count_24h:'TxTfrCnt', mvrv:'CapMVRVCur', market_cap_usd:'CapMrktCurUSD', circulating_supply_btc:'SplyCur', exchange_inflow_btc:'FlowInExNtv', exchange_outflow_btc:'FlowOutExNtv', exchange_balance_btc:'SplyExNtv', fees_total_btc:'FeeTotNtv', issuance_btc:'IssTotNtv', price_usd:'ReferenceRateUSD' };
    for (const [alias, key] of Object.entries(aliases)) if (metrics[`cm_${key}`]) metrics[alias] = { ...metrics[`cm_${key}`] };
    const inflow = metrics.exchange_inflow_btc, outflow = metrics.exchange_outflow_btc;
    // Subtraction only when both values refer to the same provider interval.
    if (inflow && outflow && inflow.value !== null && outflow.value !== null && inflow.observed_at === outflow.observed_at)
      put('exchange_netflow_btc', inflow.value - outflow.value, 'BTC/day', 'coinmetrics', inflow.observed_at);
    const complete = rows.filter(x => finite(x.AdrActCnt) !== null && now.getTime() - Date.parse(String(x.time)) >= 86400_000);
    if (complete.length >= 14) {
      const last = complete.slice(-14), end = Date.parse(String(last[13].time));
      const contiguous = last.every((r,i) => !i || Date.parse(String(r.time)) - Date.parse(String(last[i-1].time)) === 86400_000);
      if (contiguous && now.getTime() - end <= DAILY_MAX_AGE_MS) {
        const avg = (rs: Row[]) => rs.reduce((s,r) => s + Number(r.AdrActCnt),0)/rs.length;
        const previous = avg(last.slice(0,7));
        if (previous > 0) put('active_addresses_change_7d_pct', (avg(last.slice(7))/previous-1)*100, '%', 'coinmetrics', String(last[13].time));
      }
    }
  });
  await source('blockchain', async () => {
    const stats = await json<Row>('https://blockchain.info/stats?format=json');
    const timestamp = finite(stats.timestamp);
    if (!timestamp) throw new Error('Blockchain stats missing source timestamp');
    const observed = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toISOString();
    raw_data.blockchain = stats;
    const fields: Record<string, [string,string,number?]> = {
      n_tx:['bc_transactions_24h','transactions/day'], n_blocks_mined:['blocks_24h','blocks/day'], minutes_between_blocks:['block_interval_minutes','minutes'],
      totalbc:['bc_supply_btc','BTC',1e8], n_btc_mined:['bc_issuance_btc','BTC/day',1e8], total_fees_btc:['bc_fees_total_btc','BTC/day',1e8],
      estimated_transaction_volume_usd:['estimated_transfer_volume_usd','USD/day'], estimated_btc_sent:['estimated_transfer_volume_btc','BTC/day',1e8],
      total_btc_sent:['raw_transfer_volume_btc','BTC/day',1e8], blocks_size:['block_size_total_bytes','bytes/day'], miners_revenue_usd:['miner_revenue_usd','USD/day'],
      miners_revenue_btc:['miner_revenue_btc','BTC/day',1e8], difficulty:['bc_difficulty','difficulty'], n_blocks_total:['bc_block_height','blocks']
    };
    for (const [key,[alias,unit,divisor]] of Object.entries(fields)) {
      const v = finite(stats[key]);
      const invalid = v === null || v < 0 || (key.startsWith('miners_revenue') && v === 0 && Number(stats.n_btc_mined) > 0);
      put(alias, invalid ? null : v!/(divisor??1), unit, 'blockchain', observed);
    }
  });
  // Each endpoint has its own status so one failure cannot discard other mempool metrics.
  for (const [name, path, fields] of [
    ['mempool','/api/mempool',{count:['mempool_tx_count','transactions'],vsize:['mempool_vsize','vbytes'],total_fee:['mempool_total_fee_sat','sat']}],
    ['fees','/api/v1/fees/recommended',{fastestFee:['fee_fast','sat/vB'],halfHourFee:['fee_half_hour','sat/vB'],hourFee:['fee_hour','sat/vB'],economyFee:['fee_economy','sat/vB'],minimumFee:['fee_minimum','sat/vB']}],
    ['mining','/api/v1/mining/hashrate/3d',{currentHashrate:['hash_rate_eh','EH/s'],currentDifficulty:['difficulty','difficulty']}],
    ['difficulty','/api/v1/difficulty-adjustment',{progressPercent:['difficulty_epoch_progress_pct','%'],difficultyChange:['difficulty_change_pct','%'],estimatedRetargetDate:['next_retarget_timestamp_ms','unix ms'],remainingBlocks:['retarget_remaining_blocks','blocks'],timeAvg:['block_interval_ms','ms']}]
  ] as [string,string,Record<string,[string,string]>][]) {
    await source(`mempool_${name}`, async () => {
      const data = await json<Row>(`https://mempool.space${path}`); raw_data[`mempool_${name}`] = data;
      for (const [key,[alias,unit]] of Object.entries(fields)) {
        const v = finite(data[key]); put(alias, alias==='hash_rate_eh' && v!==null ? v/1e18 : v, unit, 'mempool.space');
      }
    });
  }
  const charts: [string,string][] = [
    ['utxo-count','utxo_count'], ['n-unique-addresses','bc_active_addresses'], ['n-transactions','bc_daily_transactions'],
    ['n-transactions-per-block','transactions_per_block'], ['avg-block-size','average_block_size_mb'], ['median-confirmation-time','median_confirmation_minutes'],
    ['estimated-transaction-volume','bc_estimated_transfer_btc'], ['transaction-fees','bc_daily_fees_btc'], ['miners-revenue','bc_daily_miner_revenue_usd'],
    ['hash-rate','bc_daily_hashrate_th'], ['difficulty','bc_daily_difficulty'], ['total-bitcoins','bc_daily_supply_btc'],
    ['n-transactions-excluding-popular','nonpopular_transactions'], ['output-volume','bc_output_volume_btc'], ['transactions-per-second','transactions_per_second']
  ];
  for (const [chart, alias] of charts) {
    await source(`blockchain_chart_${chart}`, async () => {
      const data = await json<{unit:string;values:{x:number;y:number}[];name:string}>(`https://api.blockchain.info/charts/${chart}?timespan=40days&format=json`);
      if (!Array.isArray(data.values) || data.values.length > 10000) throw new Error('Unexpected or excessive chart response');
      // Preserve provider history, including rejected measurements, for auditability.
      raw_data[`blockchain_chart_${chart}`] = data;
      const points = data.values.filter(p => Number.isFinite(p.x) && finite(p.y)!==null && p.y >= 0 && p.x*1000 <= now.getTime()).sort((a,b)=>a.x-b.x);
      const last = points.at(-1);
      put(alias,last?.y??null,data.unit,'blockchain',last?new Date(last.x*1000).toISOString():at);
    });
  }
  const analysis = analyzeOnchain(metrics, now);
  return { asset:'BTC', snapshot_hour:new Date(Math.floor(now.getTime()/3600000)*3600000).toISOString(), calculated_at:at, ...analysis, metrics, sources, raw_data, strategy_version:ONCHAIN_VERSION };
}
