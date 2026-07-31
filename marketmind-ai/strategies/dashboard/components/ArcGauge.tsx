export function ArcGauge({
  value,
  label,
  direction,
  confidence,
}: {
  value: number | null;
  label: string;
  direction: string;
  confidence: number | null;
}) {
  const safe = value === null ? 0 : Math.min(Math.max(value, 0), 100);

  return (
    <div className="arc-gauge">
      <svg viewBox="0 0 240 145" role="img" aria-label={`${label} ${safe}`}>
        <defs>
          <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6d3df5" />
            <stop offset="100%" stopColor="#9c6cff" />
          </linearGradient>
        </defs>

        <path
          className="arc-track"
          d="M 35 120 A 85 85 0 0 1 205 120"
          pathLength="100"
        />
        <path
          className="arc-progress"
          d="M 35 120 A 85 85 0 0 1 205 120"
          pathLength="100"
          strokeDasharray={`${safe} 100`}
        />

        {Array.from({ length: 11 }).map((_, index) => {
          const angle = Math.PI - (Math.PI * index) / 10;
          const x1 = 120 + Math.cos(angle) * 71;
          const y1 = 120 - Math.sin(angle) * 71;
          const x2 = 120 + Math.cos(angle) * 78;
          const y2 = 120 - Math.sin(angle) * 78;

          return (
            <line
              key={index}
              className="arc-tick"
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
            />
          );
        })}

        <text className="arc-edge-label" x="25" y="140">0</text>
        <text className="arc-mid-label" x="120" y="25">50</text>
        <text className="arc-edge-label" x="207" y="140">100</text>
      </svg>

      <div className="arc-center">
        <span>{label}</span>
        <strong>{value === null ? "—" : value.toFixed(1)}</strong>
        <small>{direction}</small>
      </div>

      <div className="confidence-pill">
        신뢰도 {confidence === null ? "—" : `${confidence.toFixed(1)}%`}
      </div>
    </div>
  );
}
