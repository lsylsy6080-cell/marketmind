-- Reconstructed transactional contracts, not a dump of the unavailable Supabase functions.
-- Invoker rights, qualified objects, ownership checks and row locks are intentional.
BEGIN;
CREATE OR REPLACE FUNCTION public.acquire_worker_lock_v2(p_worker_name text,p_run_id uuid,p_ttl_seconds integer DEFAULT 300)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE acquired boolean;
BEGIN
 IF p_worker_name IS NULL OR length(p_worker_name)=0 OR p_run_id IS NULL OR p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'invalid lock arguments'; END IF;
 INSERT INTO public.worker_execution_locks(worker_name,run_id,acquired_at,locked_until,heartbeat_at)
 VALUES(p_worker_name,p_run_id,clock_timestamp(),clock_timestamp()+make_interval(secs=>p_ttl_seconds),clock_timestamp())
 ON CONFLICT(worker_name) DO UPDATE SET run_id=excluded.run_id,acquired_at=excluded.acquired_at,locked_until=excluded.locked_until,heartbeat_at=excluded.heartbeat_at
 WHERE worker_execution_locks.locked_until<=clock_timestamp() OR worker_execution_locks.run_id=p_run_id
 RETURNING true INTO acquired;
 RETURN coalesce(acquired,false);
END $$;
CREATE OR REPLACE FUNCTION public.heartbeat_worker_lock_v2(p_worker_name text,p_run_id uuid,p_ttl_seconds integer DEFAULT 300)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE touched boolean;
BEGIN
 IF p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'invalid lock TTL'; END IF;
 UPDATE public.worker_execution_locks SET locked_until=clock_timestamp()+make_interval(secs=>p_ttl_seconds),heartbeat_at=clock_timestamp()
 WHERE worker_name=p_worker_name AND run_id=p_run_id AND locked_until>clock_timestamp() RETURNING true INTO touched;
 RETURN coalesce(touched,false);
END $$;
CREATE OR REPLACE FUNCTION public.release_worker_lock_v2(p_worker_name text,p_run_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE released boolean;
BEGIN
 DELETE FROM public.worker_execution_locks WHERE worker_name=p_worker_name AND run_id=p_run_id RETURNING true INTO released;
 RETURN coalesce(released,false);
END $$;
CREATE OR REPLACE FUNCTION public.mark_stale_worker_runs_v1(p_worker_name text,p_stale_minutes integer DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed integer;
BEGIN
 IF p_stale_minutes IS NULL OR p_stale_minutes NOT BETWEEN 1 AND 1440 THEN RAISE EXCEPTION 'invalid stale interval'; END IF;
 WITH stale AS (
  UPDATE public.worker_execution_runs r SET status='failed',finished_at=clock_timestamp(),duration_ms=extract(epoch FROM clock_timestamp()-started_at)*1000,error_message='stale worker run'
  WHERE r.worker_name=p_worker_name AND r.status='running' AND r.started_at<clock_timestamp()-make_interval(mins=>p_stale_minutes)
   AND NOT EXISTS(SELECT 1 FROM public.worker_execution_locks l WHERE l.worker_name=r.worker_name AND l.run_id=r.run_id AND l.locked_until>clock_timestamp())
  RETURNING r.id
 ), stages AS (
  UPDATE public.worker_execution_stages SET status='failed',finished_at=clock_timestamp(),error_message='stale worker run'
  WHERE execution_run_id IN(SELECT id FROM stale) AND status='running' RETURNING id
 ) SELECT count(*) INTO changed FROM stale;
 RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION public.paper_open_position_v1(p_account_id bigint,p_config_id bigint,p_decision_id bigint,p_market_price numeric)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.paper_trading_accounts%ROWTYPE; c public.paper_strategy_configs%ROWTYPE; d public.final_market_decisions%ROWTYPE;
 pos_id bigint; side_value text; price numeric; budget numeric; notional numeric; fee numeric; qty numeric; stop numeric; target numeric;
BEGIN
 IF p_market_price IS NULL OR p_market_price<=0 OR p_market_price::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid market price'; END IF;
 SELECT * INTO a FROM public.paper_trading_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND OR a.is_active IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','skipped','reason','inactive account'); END IF;
 SELECT * INTO c FROM public.paper_strategy_configs WHERE id=p_config_id AND account_id=a.id AND is_active;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','skipped','reason','invalid strategy'); END IF;
 IF EXISTS(SELECT 1 FROM public.paper_positions WHERE account_id=a.id AND symbol=c.symbol AND status='open') THEN RETURN jsonb_build_object('status','skipped','reason','position already open'); END IF;
 SELECT * INTO d FROM public.final_market_decisions WHERE id=p_decision_id AND symbol=c.symbol;
 IF NOT FOUND OR d.decided_at IS NULL OR d.decided_at<clock_timestamp()-interval '30 minutes' OR d.decided_at>clock_timestamp()+interval '1 minute' OR d.trading_permission IS NULL OR d.trading_permission='blocked' OR d.final_confidence IS NULL OR d.final_confidence<c.confidence_min THEN RETURN jsonb_build_object('status','skipped','reason','decision not eligible'); END IF;
 IF c.allow_long AND d.direction='bullish' AND d.action IN('strong_buy','buy') AND d.final_score>=c.long_score_min THEN side_value:='long';
 ELSIF c.allow_short AND d.direction='bearish' AND d.action IN('reduce','sell') AND d.final_score<=c.short_score_max THEN side_value:='short';
 ELSE RETURN jsonb_build_object('status','skipped','reason','no entry signal'); END IF;
 price:=p_market_price*(1+CASE WHEN side_value='long' THEN 1 ELSE -1 END*c.slippage_percent/100);
 budget:=a.cash_balance*c.position_size_percent/100;
 notional:=budget/(1+c.fee_rate_percent/100); fee:=notional*c.fee_rate_percent/100; qty:=notional/price;
 IF price<=0 OR notional<=0 OR notional+fee>a.cash_balance THEN RETURN jsonb_build_object('status','skipped','reason','insufficient cash'); END IF;
 stop:=price*(1+CASE WHEN side_value='long' THEN -1 ELSE 1 END*c.stop_loss_percent/100);
 target:=price*(1+CASE WHEN side_value='long' THEN 1 ELSE -1 END*c.take_profit_percent/100);
 INSERT INTO public.paper_positions(account_id,strategy_config_id,opening_decision_id,symbol,side,status,quantity,entry_price,stop_loss_price,take_profit_price,entry_fee,opened_at,entry_final_score,entry_confidence,entry_direction,entry_action,entry_trading_permission,decision_snapshot)
 VALUES(a.id,c.id,d.id,c.symbol,side_value,'open',qty,price,stop,target,fee,clock_timestamp(),d.final_score,d.final_confidence,d.direction,d.action,d.trading_permission,to_jsonb(d)) RETURNING id INTO pos_id;
 UPDATE public.paper_trading_accounts SET cash_balance=cash_balance-notional-fee,total_fees=total_fees+fee,updated_at=clock_timestamp() WHERE id=a.id;
 RETURN jsonb_build_object('status','opened','position_id',pos_id,'side',side_value);
END $$;

CREATE OR REPLACE FUNCTION public.paper_close_position_v1(p_position_id bigint,p_market_price numeric,p_close_reason text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public.paper_positions%ROWTYPE; c public.paper_strategy_configs%ROWTYPE; aid bigint; trade_id bigint;
 price numeric; margin numeric; gross numeric; fee numeric; net numeric; ret numeric;
BEGIN
 IF p_market_price IS NULL OR p_market_price<=0 OR p_market_price::text IN('NaN','Infinity','-Infinity') OR p_close_reason IS NULL OR length(p_close_reason)>64 THEN RAISE EXCEPTION 'invalid close arguments'; END IF;
 SELECT account_id INTO aid FROM public.paper_positions WHERE id=p_position_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','skipped','reason','position missing'); END IF;
 PERFORM 1 FROM public.paper_trading_accounts WHERE id=aid FOR UPDATE;
 SELECT * INTO p FROM public.paper_positions WHERE id=p_position_id FOR UPDATE;
 IF p.status<>'open' THEN RETURN jsonb_build_object('status','skipped','reason','position already closed'); END IF;
 SELECT * INTO STRICT c FROM public.paper_strategy_configs WHERE id=p.strategy_config_id;
 price:=p_market_price*(1+CASE WHEN p.side='long' THEN -1 ELSE 1 END*c.slippage_percent/100);
 margin:=p.entry_price*p.quantity;
 gross:=greatest(-margin,(price-p.entry_price)*p.quantity*CASE WHEN p.side='long' THEN 1 ELSE -1 END);
 fee:=least(price*p.quantity*c.fee_rate_percent/100,greatest(0,margin+gross));
 net:=gross-p.entry_fee-fee;ret:=net/margin*100;
 UPDATE public.paper_positions SET status='closed',exit_price=price,exit_fee=fee,realized_pnl=net,realized_return_percent=ret,close_reason=p_close_reason,closed_at=clock_timestamp() WHERE id=p.id;
 INSERT INTO public.paper_trades(account_id,position_id,strategy_config_id,symbol,side,entry_price,exit_price,quantity,gross_pnl,fees,net_pnl,return_percent,close_reason,opened_at,closed_at,entry_final_score,entry_confidence,entry_direction,entry_action,entry_trading_permission,entry_decision_snapshot,holding_seconds,mfe_percent,mae_percent)
 VALUES(p.account_id,p.id,p.strategy_config_id,p.symbol,p.side,p.entry_price,price,p.quantity,gross,p.entry_fee+fee,net,ret,p_close_reason,p.opened_at,clock_timestamp(),p.entry_final_score,p.entry_confidence,p.entry_direction,p.entry_action,p.entry_trading_permission,p.decision_snapshot,extract(epoch FROM clock_timestamp()-p.opened_at),p.mfe_percent,p.mae_percent) RETURNING id INTO trade_id;
 UPDATE public.paper_trading_accounts SET cash_balance=cash_balance+margin+gross-fee,realized_pnl=realized_pnl+net,total_fees=total_fees+fee,updated_at=clock_timestamp() WHERE id=p.account_id;
 RETURN jsonb_build_object('status','closed','position_id',p.id,'trade_id',trade_id,'net_pnl',net,'return_percent',ret);
END $$;

CREATE OR REPLACE FUNCTION public.adaptive_paper_open_position_v1(
 p_account_id bigint,p_base_config_id bigint,p_symbol text,p_side text,p_decision_v2_id bigint,p_sizing_snapshot_id bigint,
 p_entry_price numeric,p_stop_loss_price numeric,p_take_profit_price numeric,p_margin_percent numeric,p_leverage numeric,
 p_margin_amount numeric,p_notional_amount numeric,p_quantity numeric,p_entry_fee numeric,p_risk_reward_ratio numeric,p_expected_stop_loss_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.adaptive_paper_accounts%ROWTYPE; d public.ai_decision_v2_snapshots%ROWTYPE; s public.adaptive_position_sizing_snapshots%ROWTYPE;
 pos_id bigint; tol numeric:=greatest(0.01,p_entry_price*0.00000001);
BEGIN
 IF p_side IS NULL OR p_side NOT IN('long','short') OR p_entry_price IS NULL OR p_entry_price<=0 OR p_quantity IS NULL OR p_quantity<=0
 OR p_margin_percent IS NULL OR p_margin_percent NOT BETWEEN 0.000001 AND 100 OR p_leverage IS NULL OR p_leverage NOT BETWEEN 1 AND 20 OR p_leverage<>trunc(p_leverage)
 OR p_margin_amount IS NULL OR p_margin_amount<=0 OR p_notional_amount IS NULL OR p_notional_amount<=0 OR p_entry_fee IS NULL OR p_entry_fee<0
 OR p_risk_reward_ratio IS NULL OR p_risk_reward_ratio NOT BETWEEN 1 AND 3 OR p_expected_stop_loss_amount IS NULL OR p_expected_stop_loss_amount<=0
 OR p_stop_loss_price IS NULL OR p_take_profit_price IS NULL OR p_stop_loss_price<=0 OR p_take_profit_price<=0
 OR (p_side='long' AND NOT(p_stop_loss_price<p_entry_price AND p_take_profit_price>p_entry_price))
 OR (p_side='short' AND NOT(p_stop_loss_price>p_entry_price AND p_take_profit_price<p_entry_price))
 OR EXISTS(SELECT 1 FROM unnest(ARRAY[p_entry_price,p_quantity,p_margin_percent,p_leverage,p_margin_amount,p_notional_amount,p_entry_fee,p_stop_loss_price,p_take_profit_price,p_risk_reward_ratio,p_expected_stop_loss_amount]) v WHERE v::text IN('NaN','Infinity','-Infinity'))
 THEN RAISE EXCEPTION 'invalid adaptive execution plan'; END IF;
 SELECT * INTO a FROM public.adaptive_paper_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND OR a.is_active IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','skipped','reason','inactive account'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.paper_strategy_configs WHERE id=p_base_config_id AND account_id=a.base_account_id AND symbol=p_symbol AND is_active) THEN RAISE EXCEPTION 'base strategy/account mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.adaptive_paper_positions WHERE account_id=a.id AND symbol=p_symbol AND status='open') THEN RETURN jsonb_build_object('status','skipped','reason','position already open'); END IF;
 SELECT * INTO d FROM public.ai_decision_v2_snapshots WHERE id=p_decision_v2_id AND symbol=p_symbol;
 IF NOT FOUND OR d.calculated_at IS NULL OR d.calculated_at<clock_timestamp()-interval '30 minutes' OR d.trading_permission IS NULL OR d.trading_permission='blocked' OR d.squeeze_permission_override='blocked' OR d.calculated_at>clock_timestamp()+interval '1 minute' OR d.entry_trigger->>'status' IS DISTINCT FROM 'READY'
 OR d.direction IS DISTINCT FROM (CASE WHEN p_side='long' THEN 'bullish' ELSE 'bearish' END) THEN RETURN jsonb_build_object('status','skipped','reason','decision not ready'); END IF;
 SELECT * INTO s FROM public.adaptive_position_sizing_snapshots WHERE id=p_sizing_snapshot_id AND decision_v2_id=d.id AND symbol=p_symbol;
 IF NOT FOUND OR s.sizing_status IS DISTINCT FROM 'candidate_ready' OR s.calculated_at IS NULL OR s.calculated_at<clock_timestamp()-interval '30 minutes' OR s.margin_percent IS NULL OR s.leverage IS NULL OR p_margin_percent>s.margin_percent OR p_leverage>s.leverage THEN RAISE EXCEPTION 'invalid sizing reference'; END IF;
 IF abs(p_notional_amount-p_entry_price*p_quantity)>tol OR abs(p_notional_amount-p_margin_amount*p_leverage)>tol OR abs(p_margin_amount-a.cash_balance*p_margin_percent/100)>tol THEN RAISE EXCEPTION 'inconsistent execution amounts'; END IF;
 IF p_margin_amount+p_entry_fee>a.cash_balance THEN RETURN jsonb_build_object('status','skipped','reason','insufficient cash'); END IF;
 INSERT INTO public.adaptive_paper_positions(account_id,base_config_id,symbol,side,status,decision_v2_id,sizing_snapshot_id,entry_price,stop_loss_price,take_profit_price,margin_percent,leverage,margin_amount,notional_amount,quantity,entry_fee,risk_reward_ratio,expected_stop_loss_amount,entry_account_equity,opened_at)
 VALUES(a.id,p_base_config_id,p_symbol,p_side,'open',d.id,s.id,p_entry_price,p_stop_loss_price,p_take_profit_price,p_margin_percent,p_leverage,p_margin_amount,p_notional_amount,p_quantity,p_entry_fee,p_risk_reward_ratio,p_expected_stop_loss_amount,a.cash_balance+a.reserved_margin,clock_timestamp()) RETURNING id INTO pos_id;
 UPDATE public.adaptive_paper_accounts SET cash_balance=cash_balance-p_margin_amount-p_entry_fee,reserved_margin=reserved_margin+p_margin_amount,total_fees=total_fees+p_entry_fee WHERE id=a.id;
 RETURN jsonb_build_object('status','opened','position_id',pos_id,'side',p_side);
END $$;

CREATE OR REPLACE FUNCTION public.adaptive_paper_close_position_v1(p_position_id bigint,p_market_price numeric,p_close_reason text,p_fee_rate_percent numeric DEFAULT 0.04)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public.adaptive_paper_positions%ROWTYPE; aid bigint; trade_id bigint; gross numeric; fee numeric; net numeric; ret numeric;
BEGIN
 IF p_market_price IS NULL OR p_market_price<=0 OR p_fee_rate_percent IS NULL OR p_fee_rate_percent NOT BETWEEN 0 AND 5 OR p_close_reason IS NULL
 OR p_market_price::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid adaptive close arguments'; END IF;
 SELECT account_id INTO aid FROM public.adaptive_paper_positions WHERE id=p_position_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','skipped','reason','position missing'); END IF;
 PERFORM 1 FROM public.adaptive_paper_accounts WHERE id=aid FOR UPDATE;
 SELECT * INTO p FROM public.adaptive_paper_positions WHERE id=p_position_id FOR UPDATE;
 IF p.status<>'open' THEN RETURN jsonb_build_object('status','skipped','reason','position already closed'); END IF;
 gross:=greatest(-p.margin_amount,(p_market_price-p.entry_price)*p.quantity*CASE WHEN p.side='long' THEN 1 ELSE -1 END);
 fee:=least(p_market_price*p.quantity*p_fee_rate_percent/100,greatest(0,p.margin_amount+gross));
 net:=gross-p.entry_fee-fee;ret:=net/p.margin_amount*100;
 UPDATE public.adaptive_paper_positions SET status='closed',exit_price=p_market_price,exit_fee=fee,realized_pnl=net,realized_return_percent=ret,close_reason=p_close_reason,closed_at=clock_timestamp() WHERE id=p.id;
 INSERT INTO public.adaptive_paper_trades(account_id,position_id,base_config_id,decision_v2_id,sizing_snapshot_id,symbol,side,entry_price,exit_price,quantity,margin_amount,notional_amount,leverage,entry_fee,exit_fee,gross_pnl,net_pnl,return_percent,return_on_margin_percent,return_on_equity_percent,entry_account_equity,close_reason,opened_at,closed_at)
 VALUES(p.account_id,p.id,p.base_config_id,p.decision_v2_id,p.sizing_snapshot_id,p.symbol,p.side,p.entry_price,p_market_price,p.quantity,p.margin_amount,p.notional_amount,p.leverage,p.entry_fee,fee,gross,net,ret,ret,net/nullif(p.entry_account_equity,0)*100,p.entry_account_equity,p_close_reason,p.opened_at,clock_timestamp()) RETURNING id INTO trade_id;
 UPDATE public.adaptive_paper_accounts SET cash_balance=cash_balance+p.margin_amount+gross-fee,reserved_margin=reserved_margin-p.margin_amount,realized_pnl=realized_pnl+net,total_fees=total_fees+fee WHERE id=p.account_id;
 RETURN jsonb_build_object('status','closed','position_id',p.id,'trade_id',trade_id,'net_pnl',net,'return_percent',ret);
END $$;

-- Functions are not callable by arbitrary roles. Owner can grant an explicit worker role later.
DO $permissions$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('acquire_worker_lock_v2','heartbeat_worker_lock_v2','release_worker_lock_v2','mark_stale_worker_runs_v1','paper_open_position_v1','paper_close_position_v1','adaptive_paper_open_position_v1','adaptive_paper_close_position_v1') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 END LOOP;
END $permissions$;
COMMIT;
