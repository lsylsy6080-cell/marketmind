import { formatDateTime } from "../format";
import type { FinalMarketDecision } from "../types";

export function DashboardHeader({
  latestDecision,
}: {
  latestDecision: FinalMarketDecision | null;
}) {
  return (
    <header className="dashboard-header">
      <span className="system-dot" />
      <span>시스템 정상</span>
      <span className="header-separator">·</span>
      <span>
        마지막 업데이트:{" "}
        {latestDecision ? formatDateTime(latestDecision.decided_at) : "대기 중"}
      </span>
    </header>
  );
}
