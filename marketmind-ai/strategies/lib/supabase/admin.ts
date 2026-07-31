import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseSecretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY(또는 SUPABASE_SERVICE_ROLE_KEY)가 필요합니다.");
  return createClient(supabaseUrl, supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
