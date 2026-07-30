export default function Loading() {
  return (
    <main className="page-shell">
      <div className="terminal">
        <div className="skeleton skeleton-nav" />
        <div className="skeleton skeleton-ticker" />
        <div className="hero-grid">
          <div className="skeleton skeleton-hero" />
          <div className="skeleton skeleton-hero" />
        </div>
        <div className="skeleton skeleton-summary" />
        <div className="visualization-grid">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
        <div className="analytics-grid">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
        <div className="skeleton skeleton-table" />
      </div>
    </main>
  );
}
