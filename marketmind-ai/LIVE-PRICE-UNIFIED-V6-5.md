# MarketMind AI V6.5 — 실시간 가격 통합

- 모의 트레이딩에서 사용 중인 `useLiveBtcPrice()`를 시장 대시보드 차트에도 동일하게 사용
- 과거 완료 캔들: `/api/market-chart` → Supabase
- 현재 진행 캔들: Binance USDⓈ-M Futures 실시간 가격 스트림으로 브라우저에서 즉시 갱신
- 실시간 가격 하나로 차트 헤더 현재가 / 현재 캔들 / 포지션 ROI / 미실현 PnL 계산
- 초기 히스토리 500개 → 240개로 경량화 (EMA120 유지)
- 과거 추가 로딩 1000개 → 500개로 경량화
- 기존 디자인, 시간봉 버튼, EMA20/60/120, LONG/SHORT 마커, 진입가 라인 유지

구조:

```text
Supabase 완료 캔들 ──> 과거 차트
                         +
useLiveBtcPrice() ─────> 현재 캔들 실시간 update
       ├───────────────> 차트 현재가
       └───────────────> 모의 트레이딩 PnL/ROI
```

PC에서 확인:

```powershell
cd C:\Project\coin-research\marketmind-ai
npm run build
```
