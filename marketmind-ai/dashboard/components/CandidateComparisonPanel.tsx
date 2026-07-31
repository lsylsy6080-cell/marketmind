import type {
  CandidateComparisonData,
  CandidateComparisonRow,
} from "../types";

type Props = {
  data: CandidateComparisonData;
};

const nf = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 3,
});

function percent(value: number | null): string {
  return value === null ? "-" : `${nf.format(value)}%`;
}

function statusLabel(row: CandidateComparisonRow): string {
  if (row.sample_status === "ready") return "검증 준비";
  if (row.sample_status === "provisional") return "예비 비교";
  return `표본 부족 · ${Math.max(0, 30 - row.selected_trades)}회 필요`;
}

function statusClass(row: CandidateComparisonRow): string {
  return row.sample_status === "ready"
    ? "candidate-ready"
    : row.sample_status === "provisional"
      ? "candidate-provisional"
      : "candidate-insufficient";
}

function tone(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "is-positive" : "is-negative";
}

function tentativeLeader(
  rows: CandidateComparisonRow[],
): CandidateComparisonRow | null {
  const eligible = rows.filter((row) => row.optimization_eligible);
  if (eligible.length === 0) return null;

  return eligible.reduce((best, row) =>
    (row.expected_return_percent ?? Number.NEGATIVE_INFINITY) >
    (best.expected_return_percent ?? Number.NEGATIVE_INFINITY)
      ? row
      : best,
  );
}

export function CandidateComparisonPanel({ data }: Props) {
  if (data.error) {
    return (
      <section className="candidate-panel">
        <h2>Phase 5-2 전략 후보 비교</h2>
        <p className="strategy-compare-error">{data.error}</p>
      </section>
    );
  }

  if (data.rows.length === 0) {
    return (
      <section className="candidate-panel">
        <h2>Phase 5-2 전략 후보 비교</h2>
        <p className="strategy-compare-empty">
          워커가 완료된 24시간 Backtest를 분석하면 후보 결과가 표시됩니다.
        </p>
      </section>
    );
  }

  const leader = tentativeLeader(data.rows);

  return (
    <section className="candidate-panel">
      <div className="candidate-heading">
        <div>
          <span>STRATEGY OPTIMIZATION LAB</span>
          <h2>Phase 5-2 전략 후보 비교</h2>
          <p>
            동일한 Final Market AI 판단으로 보수형·균형형·공격형의 진입
            기준과 포지션 크기를 비교합니다.
          </p>
        </div>
        <div className="candidate-leader">
          <small>현재 예비 선두</small>
          <strong>{leader?.candidate_name ?? "표본 수집 중"}</strong>
          <em>
            {leader
              ? `기대수익 ${percent(leader.expected_return_percent)}`
              : "30회 이상 필요"}
          </em>
        </div>
      </div>

      <div className="candidate-grid">
        {data.rows.map((row) => (
          <article
            className={`candidate-card ${
              leader?.candidate_key === row.candidate_key
                ? "candidate-leader-card"
                : ""
            }`}
            key={row.candidate_key}
          >
            <header>
              <div>
                <span>{row.candidate_kind.toUpperCase()}</span>
                <h3>{row.candidate_name}</h3>
              </div>
              <b className={statusClass(row)}>{statusLabel(row)}</b>
            </header>

            <div className="candidate-main-metrics">
              <div>
                <span>기대수익</span>
                <strong className={tone(row.expected_return_percent)}>
                  {percent(row.expected_return_percent)}
                </strong>
              </div>
              <div>
                <span>누적 시뮬레이션</span>
                <strong className={tone(row.cumulative_return_percent)}>
                  {percent(row.cumulative_return_percent)}
                </strong>
              </div>
            </div>

            <dl>
              <div>
                <dt>선택 거래</dt>
                <dd>{row.selected_trades}회</dd>
              </div>
              <div>
                <dt>승률</dt>
                <dd>{percent(row.win_rate)}</dd>
              </div>
              <div>
                <dt>수익 팩터</dt>
                <dd>{row.profit_factor === null ? "-" : nf.format(row.profit_factor)}</dd>
              </div>
              <div>
                <dt>최대 낙폭</dt>
                <dd>{percent(row.max_drawdown_percent)}</dd>
              </div>
            </dl>

            <div className="candidate-rules">
              <span>LONG ≥ {nf.format(row.long_score_min)}</span>
              <span>SHORT ≤ {nf.format(row.short_score_max)}</span>
              <span>신뢰도 ≥ {nf.format(row.confidence_min)}</span>
              <span>포지션 {percent(row.position_size_percent)}</span>
            </div>
          </article>
        ))}
      </div>

      <p className="candidate-warning">
        30회 미만 후보는 순위에서 제외됩니다. 이 결과는 후보 비교용이며 실제
        모의매매 설정을 자동으로 변경하지 않습니다.
      </p>
    </section>
  );
}
