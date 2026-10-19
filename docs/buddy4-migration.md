# Buddy4 PostgreSQL 전환 — 테스트와 운영 인수 절차

작업 브랜치: `feat/buddy4-postgres-migration`, Draft PR #1. `main` 병합, 운영 DB 적용, PM2·Termux 부팅 설정 변경은 수행하지 않는다.

## 구현된 경로

```
기존 수집·계산 엔진 → shared parameterized SQL adapter → Buddy4 PostgreSQL
Vercel Server Components / Next API → HTTPS + server-only Bearer token → loopback API → read-only PostgreSQL role
GitHub ETF schedule → 별도 job token → 고정 ETF job → 기존 ETF collector
```

Supabase SDK/SSR 패키지와 런타임 환경변수 의존성을 제거했다. 원래 저장소에는 로그인·세션 처리 화면이 없고 SSR/browser client factory만 미사용 상태였다. 사용자 로그인 기능이 있다고 가정하지 않는다. 이 변경이 제공하는 인증은 **Vercel 서버/API와 Buddy4 사이의 서비스 인증**이다. Browser에 DB 비밀번호나 API token을 전달하지 않는다.

shared adapter는 실제 사용된 select/filter/order/range/single/maybeSingle/count/JSONB projection/insert/update/upsert/delete/RPC를 지원한다. SQL 식별자는 검증하고 값은 바인딩한다. 원본 계산 엔진을 대체하지 않는다.

## 1. 버디4에서만 실행할 준비 명령

아래는 사용자가 버디4 Termux에서 실행할 명령이다. 현재 checkout을 전환하지 않고 별도 worktree를 사용한다.

```sh
git fetch origin feat/buddy4-postgres-migration
git worktree add --detach ../marketmind-buddy4-test origin/feat/buddy4-postgres-migration
cd ../marketmind-buddy4-test
npm ci --prefix packages/database
npm ci --prefix market-worker
mkdir -p work
```

운영 DB의 구조와 백업을 확보한다. 백업에는 민감한 데이터가 있을 수 있으므로 Git에 추가하지 않는다.

```sh
pg_dump -Fc -d marketmind -f work/marketmind-before-buddy4.dump
pg_dump --schema-only --no-owner --no-privileges -d marketmind \
  -t public.market_candles -t public.onchain_snapshots \
  -t public.technical_snapshots -t public.market_scores \
  -t public.funding_snapshots > work/buddy4-existing-five.sql
```

## 2. 빈 테스트 DB와 복원 테스트 DB

이미 존재하는 DB에 `createdb`가 실패하면 삭제하거나 재사용하지 말고 새 이름을 선택한다.

```sh
createdb marketmind_migration_test
cd market-worker
PGDATABASE=marketmind_migration_test BUDDY4_TEST_DATABASE=1 \
  node --import tsx scripts/migrate-buddy4.ts
PGDATABASE=marketmind_migration_test node scripts/buddy4-batch-validate.mjs --check-db
cd ..
createdb marketmind_migration_restore
pg_restore --no-owner --no-privileges -d marketmind_migration_restore work/marketmind-before-buddy4.dump
cd market-worker
PGDATABASE=marketmind_migration_restore BUDDY4_TEST_DATABASE=1 \
  node --import tsx scripts/migrate-buddy4.ts
```

실행기는 명시적 테스트 플래그와 `_test`/`_restore` 이름을 요구하며, 전체 파일을 하나의 트랜잭션·advisory lock·checksum 이력으로 적용한다. 실패하면 롤백한다. `FULL_TEST_SCHEMA.sql`을 직접 `psql -X -v ON_ERROR_STOP=1 -d marketmind_migration_test -f ...`로 실행하는 방법도 있지만, checksum 이력과 타입 비교는 TypeScript 실행기를 사용하는 편이 좋다. 두 방법을 운영 DB에서 실행하지 않는다.

복원 DB에서 행 수, 최신 7개 시간봉, 기존 지표·점수·펀딩 내역이 유지되는지 확인한다. 실제 컬럼 차이가 있으면 `buddy4-existing-five.sql` 기준으로 조정해야 하며 자동 ALTER로 우회하지 않는다.

## 3. 자동 검증

```sh
# Test role needs CREATEDB to create/dispose only random mm_*_test databases.
BUDDY4_TEST_DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5432/marketmind_migration_test" \
  npm run buddy4:test
npm run typecheck
node scripts/run-engine-tests.mjs
```

DB URL의 대상 이름이 `_test`가 아니면 테스트가 거부된다. 테스트는 기존 운영 DB·기존 테스트 DB를 삭제하지 않는다. 직접 만든 무작위 테스트 DB만 정리한다. 기본값은 PGlite이지만 동시성 검증은 실제 PostgreSQL 18.2에서 실행해야 한다. CI workflow도 PostgreSQL 18.2를 사용한다.

통합 테스트의 외부 Funding/RSS/Farside/가격 응답은 fixture다. 실제 공급자 가용성·rate limit·버디4 절전 복구와 HTTPS 경유 접근을 검증했다고 보지 않는다. 엔진이 데이터 부족으로 observe/hold를 반환하는 조건을 제거하지 않는다.

## 4. 환경변수와 권한 준비

`market-worker/.env.example`, `marketmind-ai/.env.example`을 참고한다. 실제 비밀은 별도 환경 또는 `.env`에 저장한다.

테스트 DB에서 운영자가 로그인 역할을 만들고 그룹 권한을 배정한다. 비밀번호는 `psql`의 `\password`로 설정한다.

```sql
-- 역할 이름은 예시이며 실제 기존 로그인과 충돌하지 않게 정한다.
CREATE ROLE buddy4_worker LOGIN;
GRANT marketmind_worker TO buddy4_worker;
CREATE ROLE buddy4_dashboard LOGIN;
GRANT marketmind_api_reader TO buddy4_dashboard;
```

워커 `DATABASE_URL`과 API 조회 `BUDDY4_API_DATABASE_URL`을 분리한다. API 조회 연결은 `default_transaction_read_only=on`도 설정한다. 새 계정·전략 초기값은 테스트에서 검토하고 정한다. 임의의 운영 잔액·전략을 자동으로 추가하지 않는다.

`BUDDY4_API_TOKEN`과 별도 `BUDDY4_JOB_TOKEN`은 서로 다른 32자 이상 무작위 값이어야 한다. `openssl rand -hex 32`로 각각 생성할 수 있다. Vercel에는 server-only `BUDDY4_API_URL` / `BUDDY4_API_TOKEN`만 설정하고 `NEXT_PUBLIC_*`로 배포하지 않는다.

## 5. HTTPS API 연결 — 아직 운영 적용하지 않음

테스트 DB 환경을 명시한 별도 셸에서 `npm run buddy4:api`로 실행한다. API는 **127.0.0.1:8787**에만 바인딩한다. 기존 PM2 프로세스를 재시작하거나 `market-worker-runner`를 켜지 않는다.

검토한 TLS reverse proxy/tunnel에서 HTTPS 요청을 loopback API로 전달한다. PostgreSQL 5432를 외부에 열지 않는다. 저장소는 실제 DNS·TLS 인증서·tunnel 자격 증명을 갖고 있지 않으므로 자동 설치·변경하지 않는다.

- 대시보드: `POST /v1/query`, `BUDDY4_API_TOKEN`, select만 허용.
- 예약 ETF: `POST /v1/jobs/etf`, 별도 `BUDDY4_JOB_TOKEN`. 임의 함수·SQL 실행을 허용하지 않는다. 이 엔드포인트는 **DB에 쓰는 고정 작업**이며 대시보드 토큰으로 호출할 수 없다.
- 잘못된 토큰 401, SQL 변경 요청 403, 범위·식별자 오류 400, 요청 제한 429.
- body 128 KiB, 조회 최대 5000행, DB statement timeout 15초, 조회 캐시 no-store.
- HTTPS redirect를 따라 토큰을 재전송하지 않는다. 브라우저 직접 호출/CORS 인증 토큰 배포는 제공하지 않는다.

실제 reverse proxy에서 TLS 검증, 잘못된 토큰 거부, 웹 차트·뉴스·온체인·모의매매·전략·프로젝트 상태 페이지를 확인한다. GitHub schedule은 `BUDDY4_JOB_URL`(전체 `/v1/jobs/etf` HTTPS URL)과 `BUDDY4_JOB_TOKEN` secrets가 필요하다. 현재 feature branch workflow 변경은 main에 반영되지 않았다.

## 6. 운영 전환 승인 기준

- 실제 기존 5개 테이블 스키마 대조 및 복원 DB 데이터 보존 확인.
- 실시간 Funding → RSS → ETF → MI → AI → Paper 전체 흐름과 실패 복구 확인.
- 재구성된 paper 회계 규칙(`SCHEMA-DECISIONS.md`) 검토.
- 읽기 역할의 쓰기/RPC 거부, HTTPS·토큰·토큰 교체 검증.
- 버디4의 동시 수집 부하·발열·Android 절전·재부팅 동작 검증.
- Vercel Preview에서 전체 대시보드 확인.

이 조건을 통과한 뒤에만 별도 운영 적용 절차와 PM2 변경을 결정한다. 이번 PR은 Draft 상태로 유지하며 merge하지 않는다. 롤백은 worker/API 중지와 기존 버전·환경 복귀를 우선하고, DB 백업 복원은 별도 검토한다. 자동 DROP/TRUNCATE 다운 마이그레이션은 제공하지 않는다.
