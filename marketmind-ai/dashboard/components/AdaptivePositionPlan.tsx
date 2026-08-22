import type { AdaptivePositionPlanData } from "../adaptive-position-data";
import styles from "./AdaptivePositionPlan.module.css";

function money(value: number | null, digits = 2) {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function number(value: number | null, digits = 2) {
  return value == null ? "—" : value.toFixed(digits);
}

function statusLabel(data: AdaptivePositionPlanData) {
  if (data.status === "open") return "POSITION OPEN";
  if (data.status === "ready") return "READY TO EXECUTE";
  if (data.status === "watch") return data.triggerStatus || "WATCH";
  return "UNAVAILABLE";
}

export function AdaptivePositionPlan({
  data,
}: {
  data: AdaptivePositionPlanData;
}) {
  const side = data.side ??
    (data.direction === "bullish"
      ? "long"
      : data.direction === "bearish"
        ? "short"
        : null);

  const statusClass =
    data.status === "open"
      ? styles.open
      : data.status === "ready"
        ? styles.ready
        : data.status === "watch"
          ? styles.watch
          : styles.unavailable;

  return (
    <section className={`${styles.panel} panel`}>
      <header className={styles.header}>
        <div>
          <span className="section-kicker">ADAPTIVE EXECUTION</span>
          <h2>AI 포지션 플랜</h2>
          <p>
            Entry Trigger · Dynamic Sizing · Liquidation Safety를 한 화면에서 확인합니다.
          </p>
        </div>

        <div className={`${styles.status} ${statusClass}`}>
          <i />
          <div>
            <small>EXECUTION STATUS</small>
            <strong>{statusLabel(data)}</strong>
          </div>
        </div>
      </header>

      {data.error ? (
        <div className={styles.error}>
          Adaptive Position 데이터를 불러오지 못했습니다.
          <small>{data.error}</small>
        </div>
      ) : (
        <>
          <div className={styles.heroGrid}>
            <article className={styles.sideCard}>
              <span>방향</span>
              <strong className={side === "short" ? styles.short : styles.long}>
                {side ? side.toUpperCase() : "WAIT"}
              </strong>
              <small>Trigger {data.triggerStatus}</small>
            </article>

            <article>
              <span>증거금</span>
              <strong>
                {data.marginPercent == null
                  ? "—"
                  : `${number(data.marginPercent)}%`}
              </strong>
              <small>{money(data.marginAmount)} reserved</small>
            </article>

            <article>
              <span>레버리지</span>
              <strong>
                {data.appliedLeverage == null
                  ? "—"
                  : `${number(data.appliedLeverage, 0)}x`}
              </strong>
              <small>
                요청{" "}
                {data.requestedLeverage == null
                  ? "—"
                  : `${number(data.requestedLeverage, 0)}x`}
                {data.leverageAdjusted ? " → 안전 조정" : ""}
              </small>
            </article>

            <article>
              <span>명목 포지션</span>
              <strong>{money(data.notionalAmount)}</strong>
              <small>
                Sizing {data.sizingScore == null ? "—" : number(data.sizingScore)}
                {" · "}
                {data.riskTier ?? "—"}
              </small>
            </article>

            <article>
              <span>미실현 PnL</span>
              <strong
                className={
                  (data.unrealizedPnl ?? 0) >= 0 ? styles.positive : styles.negative
                }
              >
                {data.unrealizedPnl == null
                  ? "—"
                  : `${data.unrealizedPnl >= 0 ? "+" : ""}${number(data.unrealizedPnl)} USDT`}
              </strong>
              <small>Adaptive Equity {money(data.equity)}</small>
            </article>
          </div>

          <div className={styles.executionGrid}>
            <div className={styles.pricePlan}>
              <div className={styles.sectionTitle}>
                <strong>Price Plan</strong>
                <span>{data.status === "open" ? "실제 포지션" : "진입 계획"}</span>
              </div>

              <div className={styles.priceRows}>
                <span>
                  <small>현재가</small>
                  <b>{money(data.currentPrice)}</b>
                </span>
                <span>
                  <small>진입가</small>
                  <b>{money(data.entryPrice)}</b>
                </span>
                <span>
                  <small>1차 관심가</small>
                  <b>{money(data.firstInterestPrice)}</b>
                </span>
                <span>
                  <small>2차 관심가</small>
                  <b>{money(data.secondInterestPrice)}</b>
                </span>
                <span className={styles.stop}>
                  <small>손절 / 무효화</small>
                  <b>{money(data.stopLossPrice ?? data.invalidationPrice)}</b>
                </span>
                <span className={styles.target}>
                  <small>목표가</small>
                  <b>{money(data.takeProfitPrice)}</b>
                </span>
              </div>
            </div>

            <div className={styles.liquidation}>
              <div className={styles.sectionTitle}>
                <strong>Liquidation Safety</strong>
                <span
                  className={
                    data.liquidationSafetyStatus === "adjusted"
                      ? styles.adjusted
                      : styles.safe
                  }
                >
                  {data.liquidationSafetyStatus?.toUpperCase() ?? "WAITING"}
                </span>
              </div>

              <div className={styles.liqMain}>
                <div>
                  <span>예상 청산가</span>
                  <strong>{money(data.estimatedLiquidationPrice)}</strong>
                </div>
                <div>
                  <span>청산 거리</span>
                  <strong>
                    {data.liquidationDistancePercent == null
                      ? "—"
                      : `${number(data.liquidationDistancePercent)}%`}
                  </strong>
                </div>
                <div>
                  <span>추가 안전 버퍼</span>
                  <strong>
                    {data.liquidationSafetyBufferPercent == null
                      ? "—"
                      : `${number(data.liquidationSafetyBufferPercent)}%p`}
                  </strong>
                </div>
              </div>

              <div className={styles.safetyTrack}>
                <i
                  className={
                    data.liquidationSafetyStatus === "adjusted"
                      ? styles.trackAdjusted
                      : styles.trackSafe
                  }
                />
              </div>

              <p>
                {data.status === "open"
                  ? data.leverageAdjusted
                    ? `Sizing 요청 ${number(data.requestedLeverage, 0)}x를 청산 안전거리 때문에 ${number(data.appliedLeverage, 0)}x로 낮춰 적용했습니다.`
                    : "현재 적용 레버리지가 손절가와 청산 안전거리 조건을 충족했습니다."
                  : data.status === "ready"
                    ? "READY 상태입니다. 실행 시 최신 가격으로 청산 안전거리를 다시 계산합니다."
                    : "Entry Trigger가 READY가 되면 레버리지와 예상 청산가가 확정됩니다."}
              </p>
            </div>
          </div>

          <footer className={styles.footer}>
            <span>
              이 청산가는 Paper Risk Guard 추정치이며 실제 거래소 청산가와 다를 수 있습니다.
            </span>
            <small>
              {data.calculatedAt
                ? new Date(data.calculatedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })
                : "데이터 대기 중"}
            </small>
          </footer>
        </>
      )}
    </section>
  );
}
