-- Views are derived from dashboard/optimization readers, not empty placeholder tables.
BEGIN;
CREATE OR REPLACE VIEW public.latest_strategy_performance WITH(security_invoker=true) AS
 SELECT DISTINCT ON(strategy_config_id) * FROM public.strategy_performance_snapshots ORDER BY strategy_config_id,analyzed_at DESC,id DESC;
CREATE OR REPLACE VIEW public.latest_strategy_candidate_comparisons WITH(security_invoker=true) AS
 SELECT * FROM public.strategy_candidate_comparisons WHERE comparison_run_id=(SELECT comparison_run_id FROM public.strategy_candidate_comparisons ORDER BY analyzed_at DESC,id DESC LIMIT 1);
CREATE OR REPLACE VIEW public.latest_strategy_validation_results WITH(security_invoker=true) AS
 SELECT * FROM public.strategy_validation_results WHERE validation_run_id=(SELECT validation_run_id FROM public.strategy_validation_results ORDER BY analyzed_at DESC,id DESC LIMIT 1);
CREATE OR REPLACE VIEW public.latest_strategy_recommendation WITH(security_invoker=true) AS
 SELECT * FROM public.strategy_recommendations ORDER BY recommended_at DESC,id DESC LIMIT 1;
CREATE OR REPLACE VIEW public.latest_strategy_optimization_status WITH(security_invoker=true) AS
 SELECT * FROM public.strategy_optimization_status ORDER BY checked_at DESC,id DESC LIMIT 1;
CREATE OR REPLACE VIEW public.paper_strategy_comparison_v1 WITH(security_invoker=true) AS
 SELECT c.id AS config_id,c.account_id,c.sort_order,c.strategy_name,c.strategy_kind,c.strategy_version,c.symbol,c.description,
 c.long_score_min,c.short_score_max,c.confidence_min,c.stop_loss_percent,c.take_profit_percent,c.max_holding_minutes,
 a.initial_balance,a.cash_balance,a.realized_pnl,a.total_fees,
 coalesce(e.equity,a.cash_balance+coalesce(o.reserved,0)) AS equity,
 (coalesce(e.equity,a.cash_balance+coalesce(o.reserved,0))/nullif(a.initial_balance,0)-1)*100 AS total_return_percent,
 coalesce(t.total_trades,0) AS total_trades,coalesce(t.winning_trades,0) AS winning_trades,coalesce(t.losing_trades,0) AS losing_trades,
 t.win_rate,coalesce(t.net_pnl,0) AS net_pnl,t.avg_return_percent,t.avg_win_percent,t.avg_loss_percent,t.avg_holding_minutes,
 coalesce(o.open_positions,0) AS open_positions,t.profit_factor
 FROM public.paper_strategy_configs c JOIN public.paper_trading_accounts a ON a.id=c.account_id
 LEFT JOIN LATERAL(SELECT * FROM public.paper_equity_snapshots e WHERE e.account_id=a.id AND e.symbol=c.symbol ORDER BY captured_at DESC,id DESC LIMIT 1)e ON true
 LEFT JOIN LATERAL(SELECT count(*) AS open_positions,sum(entry_price*quantity) AS reserved FROM public.paper_positions p WHERE p.account_id=a.id AND p.symbol=c.symbol AND p.status='open')o ON true
 LEFT JOIN LATERAL(
 SELECT count(*) AS total_trades,count(*) FILTER(WHERE net_pnl>0) AS winning_trades,count(*) FILTER(WHERE net_pnl<0) AS losing_trades,
  count(*) FILTER(WHERE net_pnl>0)::numeric/nullif(count(*),0)*100 AS win_rate,sum(net_pnl) AS net_pnl,
  avg(return_percent) AS avg_return_percent,avg(return_percent) FILTER(WHERE net_pnl>0) AS avg_win_percent,
  avg(return_percent) FILTER(WHERE net_pnl<0) AS avg_loss_percent,avg(extract(epoch FROM closed_at-opened_at)/60) AS avg_holding_minutes,
  sum(net_pnl) FILTER(WHERE net_pnl>0)/nullif(abs(sum(net_pnl) FILTER(WHERE net_pnl<0)),0) AS profit_factor
 FROM public.paper_trades t WHERE t.account_id=a.id AND t.symbol=c.symbol AND t.strategy_config_id=c.id
 )t ON true;
COMMIT;
