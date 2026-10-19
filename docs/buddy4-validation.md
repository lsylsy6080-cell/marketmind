# Buddy4 migration validation record

검증 환경: 격리된 Linux 테스트 환경, **PostgreSQL 18.2**, Node.js 24.19.0, Next.js 16.2.12. 버디4 운영 DB에 접속하거나 마이그레이션하지 않았다. 테스트용 DB와 fixture 데이터만 사용했다.

## 통과한 검증

- `npm run typecheck --prefix market-worker`: 엔진·실행 스크립트·신규 테스트 포함.
- `npx tsc --noEmit` in `marketmind-ai`.
- `npm run buddy4:test --prefix market-worker` with a local PostgreSQL 18.2 test URL: **11/11**.
- `node market-worker/scripts/run-engine-tests.mjs`: 기존 워커 엔진 **52/52 test files**.
- `npm run build --prefix marketmind-ai`: Next.js 프로덕션 빌드.
- `node market-worker/scripts/buddy4-batch-validate.mjs`: 테이블 66·뷰 6·RPC 8, 누락 정의 없음.
- `git diff --check`: 통과.

11개 DB/API 테스트는 전체 컬럼/UNIQUE/FK/뷰/RPC, 소스 reader/writer 컬럼, 최초 적용·재적용·기존 행 보존·마이그레이션 checksum 거부, JSONB/타임스탬프/date/복합 upsert/필터/페이징/단일행 조회, SQL injection과 전체행 update/delete 거부, API 인증·대시보드/작업 토큰 분리·읽기 역할의 쓰기와 RPC 거부를 검증한다.

회계 테스트는 LONG/SHORT 동시 진입·청산, 잔액/수수료 보존, 잘못된 plan 롤백, adaptive margin 반환, 실제 BTC 가격에서 8자리 수량 반올림 허용 및 담보 초과 gap 손실을 검증한다. 워커 잠금은 소유권·만료·heartbeat·stale 실행 정리를 검증한다.

통합 테스트는 외부 응답을 fixture로 고정하고 기존 Funding → RSS 수집/뉴스 규칙/점수 → Farside ETF 수집·점수 → Market Intelligence → 최종 AI/V2 → Paper → Backtest/Performance/후보/워크포워드/추천/준비도까지 실제 DB 저장·조회한다. Phase 8 구조·상관·컨텍스트·게이트·활성화·실행 가드·성과·승격·튜닝·롤백 저장 경로도 실행한다.

## 검증되지 않은 운영 조건

- 실제 버디4의 기존 다섯 테이블이 branch DDL과 정확히 같은지 여부.
- 운영 백업을 복원한 DB에서의 적용·행 수 보존.
- 실제 공급자 연결·rate limit·외부 RSS 품질·휴대폰 장시간 부하.
- 실제 DNS/TLS reverse proxy/tunnel 및 Vercel Preview 환경변수 연결.
- Android 절전·발열·재부팅 후 신규 worker/API 동작.
- 원본 Supabase RPC와 재구성된 회계 규칙의 일치 여부. 원본 SQL은 확보되지 않았다.

따라서 PR은 Draft이며 운영 전환 완료를 의미하지 않는다. 필요한 버디4 실행 명령은 [운영 인수 절차](buddy4-migration.md)에 분리했다.
