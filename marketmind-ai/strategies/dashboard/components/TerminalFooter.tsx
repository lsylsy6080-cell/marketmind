import { formatDateTime, formatNumber } from "../format";
import type {
  FinalMarketDecision,
  PerformanceSummary,
} from "../types";

export function TerminalFooter({
  latestDecision,
  performance,
}: {
  latestDecision: FinalMarketDecision;
  performance: PerformanceSummary;
}) {
  return (
    <footer className="terminal-footer">
      <div className="footer-status">
        <span className="footer-status-dot" />
        <div>
          <small>AI Worker</small>
          <strong>Running</strong>
        </div>
      </div>

      <div>
        <small>Last Decision</small>
        <strong>{formatDateTime(latestDecision.decided_at)}</strong>
      </div>

      <div>
        <small>Evaluated</small>
        <strong>
          {performance.evaluated}/{performance.total}
        </strong>
      </div>

      <div>
        <small>Direction Accuracy</small>
        <strong>{formatNumber(performance.directionAccuracy, 1)}%</strong>
      </div>

      <div>
        <small>Strategy</small>
        <strong>{latestDecision.strategy_version ?? "V2.5"}</strong>
      </div>

      <div>
        <small>Data Source</small>
        <strong>Binance + News AI</strong>
      </div>

      <span className="footer-version">MarketMind AI V2.5</span>
    </footer>
  );
}
