import { componentLabels, directionLabel, formatDateTime, formatPercent, toneClass } from "../format";
import type { Breakdown, ComponentName } from "../types";

const componentOrder: ComponentName[] = ["funding", "etf", "news"];

export function ComponentCards({ breakdown }: { breakdown: Breakdown | null }) {
  return (
    <section>
      <div className="section-heading">
        <div><span>COMPONENT BREAKDOWN</span><h2>신호별 분석</h2></div>
        <p>신뢰도와 신선도를 반영한 실제 가중치 기준입니다.</p>
      </div>
      <div className="component-grid">
        {componentOrder.map((name) => {
          const item = breakdown?.[name];
          if (!item) {
            return <article className="panel component-card muted-card" key={name}><h3>{componentLabels[name]}</h3><p>데이터 없음</p></article>;
          }
          const weight = item.effective_weight * 100;
          return (
            <article className="panel component-card" key={name}>
              <div className="component-card-head">
                <div><span>{name.toUpperCase()}</span><h3>{componentLabels[name]}</h3></div>
                <strong className={toneClass(item.direction)}>{item.score.toFixed(1)}</strong>
              </div>
              <div className="component-direction">
                <span className={toneClass(item.direction)}>{directionLabel(item.direction)}</span>
                <small>신뢰도 {formatPercent(item.confidence, 0)}</small>
              </div>
              <div className="weight-row"><span>실제 가중치</span><strong>{formatPercent(weight, 1)}</strong></div>
              <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, weight))}%` }} /></div>
              <dl className="component-stats">
                <div><dt>점수 기여도</dt><dd>{item.contribution.toFixed(2)}</dd></div>
                <div><dt>신선도</dt><dd>{formatPercent(item.freshness_factor * 100, 0)}</dd></div>
                <div><dt>데이터 경과</dt><dd>{item.age_hours.toFixed(1)}h</dd></div>
              </dl>
              <div className="component-updated">관측 {formatDateTime(item.observed_at)}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
