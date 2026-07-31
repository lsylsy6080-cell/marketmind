export function ReasonPanel({ reasons }: { reasons: string[] | null }) {
  return (
    <section className="panel reason-panel">
      <div className="panel-heading"><span>WHY THIS SIGNAL</span><h2>판단 근거</h2></div>
      {reasons?.length ? (
        <ol>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ol>
      ) : <p className="muted-copy">세부 판단 근거가 없습니다.</p>}
    </section>
  );
}
