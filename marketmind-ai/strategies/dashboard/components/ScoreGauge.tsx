interface ScoreGaugeProps {
  score: number;
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const safeScore = Math.max(0, Math.min(100, score));
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeScore / 100);

  return (
    <div className="score-gauge" aria-label={`시장 점수 ${safeScore.toFixed(1)}점`}>
      <svg viewBox="0 0 210 210" role="img">
        <circle className="score-gauge-track" cx="105" cy="105" r={radius} />
        <circle
          className="score-gauge-progress"
          cx="105"
          cy="105"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="score-gauge-value">
        <strong>{safeScore.toFixed(1)}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}
