# Phase 6-1 — Paper Performance Analytics V2

## 추가된 분석
- LONG / SHORT 방향별 거래수, 승률, 손익, 평균 수익률, Profit Factor
- 평균 / 최소 / 최대 보유시간
- 진입 Confidence 구간별 성과 (0-49, 50-59, 60-69, 70-79, 80-89, 90-100)
- 청산 사유별 성과 (take_profit, stop_loss, max_holding, opposite_signal 등 실제 저장값 기준)

## 적용 순서
1. Supabase SQL Editor에서 `sql/phase6-1-performance-analytics-v2.sql` 실행
2. 수정된 worker 코드 배포
3. 기존 worker 실행 또는 Strategy Performance Analyzer 실행 흐름을 통해 새 스냅샷 생성 확인

## 검증
`StrategyPerformanceAnalyzer.ts`와 테스트 파일은 TypeScript strict 정적 검사를 통과했습니다.
기존 5개 테스트 + V2 방향/보유시간/Confidence/청산사유 테스트를 실행하여 모두 통과했습니다.

## 주의
V2 조회는 `paper_trades.close_reason` 컬럼이 존재한다는 현재 worker RPC 구조를 기준으로 합니다.
만약 실제 Supabase 테이블에서 컬럼명이 다르면 `run-strategy-performance-analyzer.ts`의 select/map 필드를 실제 컬럼명에 맞춰야 합니다.
