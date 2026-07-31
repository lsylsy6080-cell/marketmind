import type { StrategyValidationData, StrategyValidationRow } from "../types";

type Props = { data: StrategyValidationData };
const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });

function percent(value: number | null): string {
  return value === null ? "-" : `${nf.format(value)}%`;
}

function statusLabel(status: StrategyValidationRow["robustness_status"]): string {
  return {
    insufficient: "표본 부족",
    robust: "안정적",
    watch: "관찰 필요",
    overfit: "과최적화",
  }[status];
}

export function StrategyValidationPanel({ data }: Props) {
  if (data.error) {
    return (
      <section className="validation-panel">
        <h2>Phase 5-3 기간 분리 검증</h2>
        <p className="strategy-compare-error">{data.error}</p>
      </section>
    );
  }

  if (data.rows.length === 0) {
    return (
      <section className="validation-panel">
        <h2>Phase 5-3 기간 분리 검증</h2>
        <p className="strategy-compare-empty">
          워커가 학습 70%·검증 30% 분석을 완료하면 결과가 표시됩니다.
        </p>
      </section>
    );
  }

  const splitAt = data.rows[0]?.split_at;

  return (
    <section className="validation-panel">
      <div className="validation-heading">
        <div>
          <span>WALK-FORWARD VALIDATION</span>
          <h2>Phase 5-3 학습·검증 기간 분리</h2>
          <p>
            과거 앞 70%에서 확인한 성과가 이후 30%에서도 유지되는지
            검증합니다.
          </p>
        </div>
        <div className="validation-split">
          <small>검증 시작 시점</small>
          <strong>
            {splitAt ? new Date(splitAt).toLocaleString("ko-KR") : "-"}
          </strong>
        </div>
      </div>

      <div className="validation-grid">
        {data.rows.map((row) => (
          <article className="validation-card" key={row.candidate_key}>
            <header>
              <div>
                <span>{row.candidate_kind.toUpperCase()}</span>
                <h3>{row.candidate_name}</h3>
              </div>
              <b className={`validation-${row.robustness_status}`}>
                {statusLabel(row.robustness_status)}
              </b>
            </header>

            <div className="validation-segments">
              <div>
                <span>학습 구간 · {row.training_trades}회</span>
                <strong>{percent(row.training_expected_return)}</strong>
                <small>
                  PF {row.training_profit_factor === null ? "-" : nf.format(row.training_profit_factor)}
                  {" · "}MDD {percent(row.training_max_drawdown)}
                </small>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <span>검증 구간 · {row.validation_trades}회</span>
                <strong>{percent(row.validation_expected_return)}</strong>
                <small>
                  PF {row.validation_profit_factor === null ? "-" : nf.format(row.validation_profit_factor)}
                  {" · "}MDD {percent(row.validation_max_drawdown)}
                </small>
              </div>
            </div>

            <div className="retention-row">
              <span>기대수익 유지율</span>
              <strong>
                {row.return_retention_ratio === null
                  ? "-"
                  : percent(row.return_retention_ratio * 100)}
              </strong>
            </div>
            <p>{row.validation_reason}</p>
          </article>
        ))}
      </div>

      <p className="validation-note">
        학습 30회·검증 10회 미만은 판정을 보류합니다. 검증 통과 결과도 실제
        전략에 자동 반영되지 않습니다.
      </p>
    </section>
  );
}
