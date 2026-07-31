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

const SYMBOLS = [
  { symbol: "BTCUSDT", label: "BTC", enabled: true },
  { symbol: "ETHUSDT", label: "ETH", enabled: false },
  { symbol: "SOLUSDT", label: "SOL", enabled: false },
  { symbol: "XRPUSDT", label: "XRP", enabled: false },
];

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

        <div className="symbol-switcher" aria-label="심볼 선택">
          {SYMBOLS.map((item) => (
            <button
              key={item.symbol}
              type="button"
              disabled={!item.enabled}
              className={
                item.symbol === decision.symbol
                  ? "symbol-chip active"
                  : "symbol-chip"
              }
              title={
                item.enabled
                  ? `${item.label} 활성`
                  : `${item.label}은 멀티 심볼 Worker 연결 후 활성화됩니다.`
              }
            >
              {item.label}
            </button>
          ))}
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
        <span>Index Price</span>
        <strong>${formatPrice(funding?.index_price ?? null)}</strong>
        <small>시장 기준 가격</small>
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
