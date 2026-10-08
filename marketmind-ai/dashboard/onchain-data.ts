import { createAdminClient } from '@/lib/supabase/admin';
export interface OnchainMetric { value: number | null; unit: string; source: string; observed_at: string }
export interface OnchainSource { ok: boolean; fetched_at: string; error: string | null; metric_count: number }
export interface OnchainSnapshot {
  id?: number;
  asset: string;
  snapshot_hour: string;
  calculated_at: string;
  onchain_score: number | null;
  onchain_confidence: number;
  direction: 'bullish' | 'neutral' | 'bearish';
  metrics: Record<string, OnchainMetric>;
  signals: {key:string;label:string;score:number|null;reason:string}[];
  sources: Record<string, OnchainSource>;
  raw_data: Record<string, unknown>;
}
export type OnchainHistorySnapshot = Pick<OnchainSnapshot,'id'|'snapshot_hour'|'onchain_score'|'metrics'>;
export async function getOnchainData() {
  try {
    const client=createAdminClient();
    const [latestResult,historyResult]=await Promise.all([
      client.from('onchain_snapshots').select('*').eq('asset','BTC').order('snapshot_hour',{ascending:false}).limit(1).maybeSingle(),
      client.from('onchain_snapshots').select('id,snapshot_hour,onchain_score,hash_rate:metrics->hash_rate_eh,active:metrics->active_addresses').eq('asset','BTC').order('snapshot_hour',{ascending:false}).limit(720),
    ]);
    if(latestResult.error)throw new Error(latestResult.error.message);
    if(historyResult.error)throw new Error(historyResult.error.message);
    const latest=latestResult.data as OnchainSnapshot|null;
    const rows=historyResult.data as unknown as {id:number;snapshot_hour:string;onchain_score:number|null;hash_rate:OnchainMetric;active:OnchainMetric}[];
    const history:OnchainHistorySnapshot[]=rows.map(r=>({id:r.id,snapshot_hour:r.snapshot_hour,onchain_score:r.onchain_score,metrics:{hash_rate_eh:r.hash_rate,active_addresses:r.active}}));
    return {latest,history,error:null as string|null,connected:true};
  } catch(error:unknown) {
    return {latest:null,history:[] as OnchainHistorySnapshot[],error:error instanceof Error?error.message:String(error),connected:false};
  }
}
