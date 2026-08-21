import "dotenv/config";
import { supabase } from "../src/lib/supabase";

const workerName = "market-worker-main";
const { data, error } = await supabase
  .from("worker_execution_locks")
  .select("worker_name,run_id,acquired_at,locked_until")
  .eq("worker_name", workerName)
  .maybeSingle();

if (error) throw new Error(error.message);

const now = new Date();
if (!data) {
  console.log(JSON.stringify({ workerName, status: "unlocked", dbCheckedAt: now.toISOString() }, null, 2));
} else {
  const lockedUntil = new Date(data.locked_until);
  console.log(JSON.stringify({
    ...data,
    dbCheckedAt: now.toISOString(),
    status: lockedUntil.getTime() > now.getTime() ? "locked" : "stale",
    remainingSeconds: Math.max(0, Math.round((lockedUntil.getTime() - now.getTime()) / 1000)),
  }, null, 2));
}
