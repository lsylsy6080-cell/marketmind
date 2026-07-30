# MarketMind AI 프로젝트 관제센터 V3

> 데이터 수집부터 AI 분석, 검증, 모의투자, 소액 실거래, 자동매매까지 프로젝트 전체 흐름을 관리하기 위한 기준 문서입니다.

## 프로젝트 정보

- 버전: `v3.0`
- 상태: 개발 중
- 기준일: `2026-07-30`
- 저장소 구조: `coin-research/market-worker`, `coin-research/marketmind-ai`
- 최종 목표: 검증 가능한 AI 기반 암호화폐 투자 플랫폼

## 전체 흐름

```text
데이터 수집
    ↓
AI 분석 엔진
    ↓
BUY / HOLD / SELL
    ↓
백테스트
    ↓
모의투자
    ↓
성과 검증
    ↓
소액 실거래
    ↓
자동매매
```

## 개발 진행률

| 분야 | 진행률 | 상태 |
|---|---:|---|
| 데이터 수집 | 90% | 거의 완료 |
| AI 분석 엔진 | 75% | 고도화 중 |
| 검증 시스템 | 70% | 진행 중 |
| 웹 대시보드 | 80% | 고도화 중 |
| 실거래 준비 | 15% | 초기 단계 |
| 자동매매 | 10% | 장기 목표 |

## 현재 우선 작업

- [ ] ETF 데이터 연동
- [ ] AI 판단 이유 설명
- [ ] 고래 지갑 데이터 수집
- [ ] 리스크 엔진 설계
- [ ] 신호 히스토리 화면
- [ ] 전략 랭킹

## 기능 관리표

| 기능 | 상태 | 관련 영역 | 우선순위 |
|---|---|---|---|
| 바이낸스 캔들 수집 | 완료 | `market-worker/collector` | S |
| 기술지표 계산 | 완료 | `market-worker/indicator` | S |
| 뉴스 분석 | 완료 | `market-worker/news` | S |
| AI 종합 판단 | 완료 | `market-worker/ai-engine` | S |
| 백테스트 | 완료 | `market-worker/backtest` | S |
| 모의투자 | 고도화 중 | `market-worker/paper-trading` | S |
| 성능 분석 | 고도화 중 | `market-worker/analytics` | S |
| ETF 데이터 | 예정 | `market-worker/collector` | S |
| 고래 지갑 | 예정 | `market-worker/collector` | S |
| AI 판단 이유 | 예정 | `marketmind-ai/insight` | S |
| 리스크 엔진 | 예정 | `market-worker/risk` | A |
| 전략 랭킹 | 예정 | `marketmind-ai/strategy` | A |
| 소액 실거래 | 예정 | `market-worker/execution` | B |
| 자동매매 | 장기 목표 | `market-worker/execution` | C |

## 프로젝트 구조

```text
coin-research/
├── market-worker/
│   ├── collector
│   ├── indicator
│   ├── news
│   ├── ai-engine
│   ├── scoring
│   ├── backtest
│   ├── paper-trading
│   ├── analytics
│   ├── risk
│   └── execution
└── marketmind-ai/
    ├── dashboard
    ├── components
    ├── insight
    ├── strategy
    ├── performance
    ├── charts
    ├── project-center
    └── settings
```

## API 및 데이터 상태

| 항목 | 상태 |
|---|---|
| Binance | 정상 |
| 뉴스 수집 | 정상 |
| Funding / OI | 연동 |
| ETF | 준비 중 |
| 고래 지갑 | 준비 중 |
| 청산 데이터 | 미연동 |
| 온체인 | 미연동 |

## AI 프로젝트 비서 추천

1. ETF 데이터 연동
   - 외부 자금 흐름을 AI 판단에 반영
   - 기존 기술지표 중심 분석의 한계 보완

2. AI 판단 이유 설명
   - 신호 생성 근거를 화면에 표시
   - 맞은 판단과 틀린 판단을 사후 검증하기 쉬워짐

3. 고래 지갑 데이터 수집
   - 대규모 자금 이동을 시장 위험 신호로 활용

4. 리스크 엔진
   - 손절, 포지션 크기, 최대 허용 손실, 연속 손실 제한 관리

## 실거래 전 필수 검증

- 수수료 반영
- 슬리피지 반영
- 충분한 모의투자 표본 확보
- 최대 낙폭 기준 설정
- 연속 손실 대응 규칙
- 워크포워드 검증
- 소액 실거래 단계적 적용
- 비상 정지 기능

## 개발 원칙

- 수익률보다 재현성과 안정성을 우선한다.
- 백테스트 결과만으로 실거래를 결정하지 않는다.
- 모의투자와 실거래 성과 차이를 지속적으로 측정한다.
- 모든 AI 판단은 입력 데이터와 점수 근거를 기록한다.
- 실거래 전 리스크 제한과 비상 정지 기능을 완성한다.

## 최종 목표

```text
데이터 수집
→ AI 분석
→ 매매 판단
→ 백테스트
→ 모의투자
→ 성능 검증
→ 소액 실거래
→ 자동매매
→ AI 투자 플랫폼
```
