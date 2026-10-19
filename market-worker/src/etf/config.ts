export const config = {
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