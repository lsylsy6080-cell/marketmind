import { createAdminClient } from "../lib/supabase/admin";
import type {
  FinalMarketDecision,
  PaperEquitySnapshot,
  PaperOrder,
  PaperPosition,
  PaperStrategyConfig,
  PaperStrategyRun,
  PaperTrade,
  PaperTradingAccount,
  PaperTradingData,
} from "./types";

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericRow<T>(row: Record<string, unknown>, keys: string[]): T {
  const result = { ...row };
  keys.forEach((key) => {
    result[key] = numberValue(row[key]);
  });
  return result as T;
}

export const emptyPaperTradingData: PaperTradingData = {
  account: null,
  config: null,
  openPositions: [],
  orders: [],
  trades: [],
  runs: [],
  equity: [],
  decisionsById: {},
  marketPrice: null,
  error: null,
};

export async function getPaperTradingData(): Promise<PaperTradingData> {
  try {
    const supabase = createAdminClient();
    const accountResult = await supabase
      .from("paper_trading_accounts")
      .select("*")
      .eq("is_active", true)
      .order("id")
      .limit(1)
      .maybeSingle();

    if (accountResult.error) throw accountResult.error;
    if (!accountResult.data) return emptyPaperTradingData;

    const accountId = Number(accountResult.data.id);
    const [configResult, positionsResult, ordersResult, tradesResult, runsResult, equityResult] =
      await Promise.all([
        supabase.from("paper_strategy_configs").select("*").eq("account_id", accountId).eq("is_active", true).order("id", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("paper_positions").select("*").eq("account_id", accountId).eq("status", "open").order("opened_at", { ascending: false }).limit(20),
        supabase.from("paper_orders").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(20),
        supabase.from("paper_trades").select("*").eq("account_id", accountId).order("closed_at", { ascending: false }).limit(100),
        supabase.from("paper_strategy_runs").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(20),
        supabase.from("paper_equity_snapshots").select("*").eq("account_id", accountId).order("captured_at", { ascending: true }).limit(180),
      ]);

    const firstError = [configResult.error, positionsResult.error, ordersResult.error, tradesResult.error, runsResult.error, equityResult.error].find(Boolean);
    if (firstError) throw firstError;

    const decisionIds = new Set<number>();
    for (const position of positionsResult.data ?? []) {
      if (position.opening_decision_id) decisionIds.add(Number(position.opening_decision_id));
    }
    for (const run of runsResult.data ?? []) {
      if (run.decision_id) decisionIds.add(Number(run.decision_id));
    }

    let decisionsById: Record<number, FinalMarketDecision> = {};
    if (decisionIds.size > 0) {
      const decisionResult = await supabase.from("final_market_decisions").select("*").in("id", [...decisionIds]);
      if (!decisionResult.error) {
        decisionsById = Object.fromEntries((decisionResult.data ?? []).map((row) => [Number(row.id), row as FinalMarketDecision]));
      }
    }

    const account = numericRow<PaperTradingAccount>(accountResult.data, ["id", "initial_balance", "cash_balance", "realized_pnl", "total_fees"]);
    const config = configResult.data ? numericRow<PaperStrategyConfig>(configResult.data, ["id", "account_id", "long_score_min", "short_score_max", "confidence_min", "position_size_percent", "stop_loss_percent", "take_profit_percent", "max_holding_minutes", "fee_rate_percent", "slippage_percent"]) : null;
    const openPositions = (positionsResult.data ?? []).map((row) => numericRow<PaperPosition>(row, ["id", "account_id", "opening_decision_id", "quantity", "entry_price", "exit_price", "stop_loss_price", "take_profit_price", "entry_fee", "exit_fee", "realized_pnl", "realized_return_percent"]));
    const orders = (ordersResult.data ?? []).map((row) => numericRow<PaperOrder>(row, ["id", "account_id", "decision_id", "requested_price", "executed_price", "quantity", "notional", "fee"]));
    const trades = (tradesResult.data ?? []).map((row) => numericRow<PaperTrade>(row, ["id", "account_id", "position_id", "entry_price", "exit_price", "quantity", "gross_pnl", "fees", "net_pnl", "return_percent"]));
    const runs = (runsResult.data ?? []).map((row) => numericRow<PaperStrategyRun>(row, ["id", "account_id", "decision_id", "market_price"]));
    const equity = (equityResult.data ?? []).map((row) => numericRow<PaperEquitySnapshot>(row, ["id", "account_id", "cash_balance", "unrealized_pnl", "equity", "market_price"]));
    const marketPrice = runs.find((run) => run.market_price)?.market_price ?? equity.at(-1)?.market_price ?? openPositions[0]?.entry_price ?? null;

    return { account, config, openPositions, orders, trades, runs, equity, decisionsById, marketPrice, error: null };
  } catch (error: unknown) {
    return { ...emptyPaperTradingData, error: error instanceof Error ? error.message : String(error) };
  }
}
