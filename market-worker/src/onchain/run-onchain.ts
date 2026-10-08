import { supabase } from '../lib/supabase';
import { collectOnchain } from './collect-onchain';
export async function runOnchain(options: { dryRun?: boolean; force?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  if (!options.dryRun && !options.force) {
    const {data,error} = await supabase.from('onchain_snapshots').select('calculated_at,sources').eq('asset','BTC').order('snapshot_hour',{ascending:false}).limit(1).maybeSingle();
    if (error) throw new Error(`온체인 테이블 확인 실패: ${error.message}; migrations/20261008_onchain_snapshots.sql 적용 필요`);
    const statuses = Object.values((data?.sources ?? {}) as Record<string,{ok:boolean}>);
    const interval = statuses.length && statuses.every(x => x.ok) ? 3600_000 : 10*60_000;
    if (data && now.getTime()-Date.parse(data.calculated_at) < interval) return {status:'cached' as const};
  }
  const snapshot = await collectOnchain(now);
  if (!Object.values(snapshot.sources).some(x => x.ok)) throw new Error('모든 무료 온체인 소스 조회 실패');
  if (!options.dryRun) {
    const {error} = await supabase.from('onchain_snapshots').upsert(snapshot,{onConflict:'asset,snapshot_hour'});
    if (error) throw new Error(`온체인 저장 실패: ${error.message}`);
  }
  console.log('[Onchain]',{status:options.dryRun?'dry-run':'saved',score:snapshot.onchain_score,confidence:snapshot.onchain_confidence,metrics:Object.keys(snapshot.metrics).length,sources:snapshot.sources});
  return {status:options.dryRun?'dry-run' as const:'saved' as const,snapshot};
}
