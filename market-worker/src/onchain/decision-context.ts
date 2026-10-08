import { supabase } from '../lib/supabase';
export async function loadOnchainContext() {
  const {data,error}=await supabase.from('onchain_snapshots').select('id,snapshot_hour,calculated_at,onchain_score,onchain_confidence,direction,signals').eq('asset','BTC').order('snapshot_hour',{ascending:false}).limit(1).maybeSingle();
  if (error) { console.warn('[Onchain context]',error.message); return null; }
  const age = data ? Date.now()-Date.parse(data.calculated_at) : Infinity;
  if (!data || data.onchain_score===null || age<0 || age>2*3600_000) return null;
  return {...data,key:`${data.id}:${data.calculated_at}`,mode:'context_only' as const};
}
