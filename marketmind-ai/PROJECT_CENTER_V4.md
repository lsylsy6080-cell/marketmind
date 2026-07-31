# MarketMind AI Project Center V4

## 현재 기준

- Phase 1: 운영 안정화 완료
- Phase 2: AI Decision Pipeline 고도화 완료
- Phase 3: Paper Trading V2 고도화 완료
- Phase 4: 통합 운영 대시보드 완료
- Phase 5: 전략 최적화 예정
- Phase 6: 소액 실거래 검증 예정

## Phase 4 완료 범위

- `final_market_decisions` 최신 판단과 이력 표시
- 기술·뉴스·펀딩 점수, 신뢰도, 동적 가중치 표시
- 시장 방향, 행동, 위험도, 거래 권한 표시
- 펀딩 현재가·지수 가격·펀딩비 표시
- 판단 변화 차트와 타임라인 표시
- Paper Trading 계정·포지션·손익 요약
- 다중 전략 성과 비교
- Backtest 및 Performance Engine 성과 표시
- 데이터 없음·오류·로딩 상태 대응
- 반응형 대시보드 적용

## 데이터 흐름

1. Market Worker가 가격·기술·뉴스·펀딩 데이터를 수집합니다.
2. Decision Engine이 최종 점수, 신뢰도, 행동, 위험도와 거래 권한을 생성합니다.
3. Paper Trading V2가 유효한 판단만 모의 포지션에 반영합니다.
4. Backtest와 Performance Engine이 판단 결과를 평가합니다.
5. MarketMind AI 대시보드가 전체 결과를 통합 표시합니다.

## Phase 5 목표

- 전략별 최소 30~50회 청산 표본 확보
- 보수형·균형형·공격형 전략 성과 비교
- 승률, 기대수익, 최대 손실, 수익 팩터 기반 전략 필터링
- 임계값과 포지션 크기 최적화
- 과최적화 방지를 위한 기간 분리 검증
