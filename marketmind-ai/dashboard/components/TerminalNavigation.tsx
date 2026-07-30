export function TerminalNavigation() {
  return (
    <nav className="terminal-nav" aria-label="MarketMind AI">
      <div className="brand">
        <span className="brand-symbol">◈</span>
        <strong>MARKETMIND AI</strong>
      </div>

      <div className="nav-items">
        <span className="nav-item active">대시보드</span>
        <span className="nav-item">AI 분석</span>
        <span className="nav-item">성과 평가</span>
        <span className="nav-item">백테스트</span>
        <span className="nav-item">뉴스 인텔리전스</span>
        <span className="nav-item">펀딩 인텔리전스</span>
        <span className="nav-item">설정</span>
      </div>
    </nav>
  );
}
