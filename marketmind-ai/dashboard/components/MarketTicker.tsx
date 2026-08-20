import Image from "next/image";
import {
  formatDateTime,
  formatPercent,
  formatPrice,
  normalizeLabel,
} from "../format";
import type { FinalMarketDecision, FundingSnapshot } from "../types";

const COIN_ICONS: Record<string, string> = {
  BTCUSDT: "/assets/coins/btc.png",
  BTCUSD: "/assets/coins/btc.png",
  BTC: "/assets/coins/btc.png",
};


function getCoinIcon(symbol: string): string {
  return COIN_ICONS[symbol.toUpperCase()] ?? "/assets/coins/btc.png";
}

export function MarketTicker({
  decision,
  funding,
}: {
  decision: FinalMarketDecision;
  funding: FundingSnapshot | null;
}) {
  const fundingPercent =
    funding?.funding_rate_percent ??
    (funding?.funding_rate !== null && funding?.funding_rate !== undefined
      ? funding.funding_rate * 100
      : null);

  return (
    <section className="market-ticker panel">
      <div className="ticker-asset">
        <div className="coin-logo-wrap">
          <Image
            src={getCoinIcon(decision.symbol)}
            alt={`${decision.symbol} symbol`}
            width={64}
            height={64}
            priority
            className="coin-logo"
          />
        </div>

        <div className="asset-meta">
          <strong>{decision.symbol}</strong>
          <small>Perpetual</small>
          <span className="live-label">
            <i /> 실시간
          </span>
        </div>


      </div>

      <div className="ticker-item">
        <span>Mark Price</span>
        <strong>${formatPrice(funding?.mark_price ?? null)}</strong>
        <small className="positive-text">
          {normalizeLabel(decision.direction)}
        </small>
      </div>

      <div className="ticker-item">
        <span>Funding Rate</span>
        <strong className="positive-text">
          {formatPercent(fundingPercent, 4)}
        </strong>
        <small>{normalizeLabel(funding?.risk_level ?? null)}</small>
      </div>

      <div className="ticker-item">
        <span>업데이트</span>
        <strong className="ticker-time">
          {formatDateTime(funding?.fetched_at ?? decision.decided_at)}
        </strong>
        <small>Asia/Seoul</small>
      </div>
    </section>
  );
}
