export function Gauge({
  value,
  label,
  sublabel,
}: {
  value: number | null;
  label: string;
  sublabel?: string;
}) {
  const safe = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  const angle = -90 + safe * 1.8;

  return (
    <div className="gauge" aria-label={`${label} ${value ?? "없음"}`}>
      <svg viewBox="0 0 220 130" role="img">
        <path
          className="gauge-track"
          d="M 25 110 A 85 85 0 0 1 195 110"
          pathLength="100"
        />
        <path
          className="gauge-progress"
          d="M 25 110 A 85 85 0 0 1 195 110"
          pathLength="100"
          strokeDasharray={`${safe} 100`}
        />
        <g transform={`rotate(${angle} 110 110)`}>
          <line className="gauge-needle" x1="110" y1="110" x2="110" y2="40" />
        </g>
        <circle className="gauge-center" cx="110" cy="110" r="8" />
      </svg>

      <div className="gauge-value">
        <span>{label}</span>
        <strong>{value === null ? "—" : value.toFixed(1)}</strong>
        {sublabel ? <small>{sublabel}</small> : null}
      </div>
    </div>
  );
}
