import { createAdminClient } from "@/lib/supabase/admin";

export type OnchainSnapshot = Record<string, any> & { id?: number; snapshot_time?: string; snapshot_hour?: string; calculated_at?: string; };

export async function getOnchainData() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("onchain_snapshots").select("*").order("id", { ascending: false }).limit(168);
    if (error) throw error;
    const history = (data ?? []) as OnchainSnapshot[];
    return { latest: history[0] ?? null, history, error: null as string | null, connected: true };
  } catch (error: unknown) {
    return { latest: null, history: [] as OnchainSnapshot[], error: error instanceof Error ? error.message : String(error), connected: false };
  }
}
