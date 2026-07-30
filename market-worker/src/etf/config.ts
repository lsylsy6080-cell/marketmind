function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`환경변수 ${name}가 없습니다.`);
  return value;
}

export const config = {
  // Supabase
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Farside
  farsideUrl:
    process.env.FARSIDE_ETF_URL?.trim() ||
    "https://farside.co.uk/bitcoin-etf-flow-all-data/",

  // ETF
  asset: (process.env.ETF_ASSET?.trim() || "BTC") as
    | "BTC"
    | "ETH"
    | "SOL"
    | "XRP",

  market: (process.env.ETF_MARKET?.trim() || "US") as
    | "US"
    | "HK",

  source: process.env.ETF_SOURCE?.trim() || "farside",

  dryRun: process.env.ETF_DRY_RUN === "true",

  syncDays: Number(process.env.ETF_SYNC_DAYS ?? "7"),
};