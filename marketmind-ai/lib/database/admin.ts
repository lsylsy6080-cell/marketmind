import "server-only";
import { createHttpClient } from "@marketmind/database";
export function createAdminClient() {
  const url=process.env.BUDDY4_API_URL, token=process.env.BUDDY4_API_TOKEN;
  if(!url||!token)throw new Error("BUDDY4_API_URL and BUDDY4_API_TOKEN are required");
  return createHttpClient({url,token});
}
