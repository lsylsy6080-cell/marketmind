# MarketMind Chart Direct Timeframe V6.4

- `/api/market-chart`가 `market_candles`의 요청 timeframe을 직접 조회합니다.
- 1m → 5m/15m/1h/4h/1d 서버 재집계를 제거했습니다.
- 실제 DB 컬럼 `open_time`으로 정렬/페이지네이션합니다.
- `exchange + market_type + symbol + timeframe + open_time` 인덱스를 활용합니다.
- 완료 캔들 API에 10초 edge cache를 적용합니다.
- 실시간 캔들 갱신은 기존 Binance WebSocket을 그대로 사용합니다.

워커 선행조건: `market-worker-multitimeframe-v1` 이상.
