export function ConfidenceRing({ value }: { value: number | null }) {
  const safe = value === null ? 0 : Math.min(Math.max(value, 0), 100);

  return (
    <div
      className="confidence-ring"
      style={{
        background: `conic-gradient(var(--accent) ${safe * 3.6}deg, var(--line) 0deg)`,
      }}
    >
      <div>
        <span>Confidence</span>
        <strong>{value === null ? "—" : `${value.toFixed(1)}%`}</strong>
      </div>
    </div>
  );
}
