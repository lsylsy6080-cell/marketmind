import type { FinalMarketDecision } from "../types";
import { formatDateTime } from "../format";

export function Header({
  latestDecision,
}: {
  latestDecision: FinalMarketDecision | null;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">MARKET INTELLIGENCE</div>
        <h1>MarketMind AI</h1>
        <p>BTC 시장 판단, 백테스트, 성과를 한 화면에서 확인합니다.</p>
      </div>

      <div className="live-status">
        <span className="live-dot" />
        <div>
          <strong>시스템 정상</strong>
          <span>
            {latestDecision
              ? `최근 판단 ${formatDateTime(latestDecision.decided_at)}`
              : "판단 데이터 대기 중"}
          </span>
        </div>
      </div>
    </header>
  );
}
