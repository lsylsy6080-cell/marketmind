# Buddy4 스키마 재구성 근거와 한계

이 스키마는 원본 Supabase 카탈로그의 내보내기 결과가 아니다. 원본이 Unhealthy 상태이므로 **동작 가능한 대체 스키마**를 INSERT/UPDATE/SELECT/UPSERT, TypeScript 입력·출력 타입과 기존 001~004 DDL에서 재구성했다. 운영 전 원본 5개 테이블의 실제 `pg_dump --schema-only`와 비교해야 한다.

## 수량과 파일

- 일반 테이블 66개: 기존 DDL 5개 + `005_remaining_tables.sql`의 61개.
- 조회용 뷰 6개: `007_views.sql`. 뷰를 빈 테이블로 만들지 않는다.
- 호출되는 RPC 8개: `006_rpc.sql`.
- `schema-contract.json`: 테이블별 컬럼·타입·기본값·NOT NULL·UNIQUE·FK·호출 근거 파일.
- `source-contracts.json`: TypeScript checker로 수집한 writer 타입과 reader 컬럼. 동적 필드와 함수의 부수 효과를 전부 증명하는 자료는 아니다.
- `FULL_TEST_SCHEMA.sql`: 번호 마이그레이션을 원자적 트랜잭션으로 합친 테스트 전용 SQL. `_test`/`_restore` DB만 허용한다.

## 재구성한 설계

- 가격·금액·비율: PostgreSQL `numeric`; 식별자: `bigint`; 워커·실험 run ID: `uuid`; 시각: `timestamptz`; 거래일: `date`; 객체·배열: `jsonb`.
- 모든 실제 `onConflict` 조합에 UNIQUE를 둔다. 기존 `market_candles`는 ID 없이 수집기와 같은 복합키를 유지한다.
- FK는 caller의 식별자 매핑을 따른다. `technical_score_id`는 `market_scores.id`를 가리키며 `technical_snapshots.id`가 아니다. 지도 상세·ETF 상세만 부모 삭제 시 CASCADE, 나머지는 RESTRICT이다.
- 두 paper position 테이블은 `(account_id,symbol) WHERE status=''open''`에 부분 고유 인덱스를 둔다. 계정 행 잠금과 함께 중복 진입을 방지한다.
- 실제 계정·전략 초기값은 임의로 생성하지 않는다. 잔액·전략 임계값은 운영자가 정해야 한다. 테스트 fixture는 격리된 DB에만 삽입한다.
- 기존 `funding_snapshots`의 저장 시각은 `fetched_at`이다. 웹의 잘못된 `analyzed_at` 정렬을 수정했으며 운영 테이블에 호환용 가짜 컬럼을 추가하지 않는다.
- `date`는 Node에서 `YYYY-MM-DD`로 유지한다. Date 객체를 ISO timestamp로 바꾸면 ETF freshness가 잘못 계산된다.
- 기존 5개 테이블을 자동 ALTER하지 않는다. 마이그레이션 실행기는 기존 컬럼 누락·호환되지 않는 타입을 발견하면 전체 트랜잭션을 롤백한다.
- API 읽기 역할과 worker 역할은 별도 NOLOGIN 그룹이다. 실제 로그인 역할 가입과 비밀번호는 운영자 단계이며 코드에 자격 증명을 저장하지 않는다.

## RPC 규약

전체 실제 이름과 인자 타입은 `006_rpc.sql`의 함수 선언이 기준이다.

| 함수 | 반환 | 의미 |
| --- | --- | --- |
| `acquire_worker_lock_v2(p_worker_name text,p_run_id uuid,p_ttl_seconds integer)` | boolean | 만료되거나 동일 소유자일 때만 잠금 획득 |
| `heartbeat_worker_lock_v2` (같은 인자) | boolean | 아직 유효한 동일 소유자 잠금만 연장 |
| `release_worker_lock_v2(p_worker_name text,p_run_id uuid)` | boolean | 소유자 일치 시에만 삭제 |
| `mark_stale_worker_runs_v1(p_worker_name text,p_stale_minutes integer)` | integer | 유효한 잠금이 없는 오래된 실행·단계를 failed로 정리 |
| `paper_open_position_v1(p_account_id bigint,p_config_id bigint,p_decision_id bigint,p_market_price numeric)` | jsonb | 계정·전략 소유권, 판단 시각·방향·허용 여부 확인 후 진입 |
| `paper_close_position_v1(p_position_id bigint,p_market_price numeric,p_close_reason text)` | jsonb | 원자적 청산·거래 내역·계정 정산 |
| `adaptive_paper_open_position_v1` | jsonb | caller의 17개 이름 지정 인자, READY·sizing 참조·금액 일관성·잔액 확인 |
| `adaptive_paper_close_position_v1(p_position_id bigint,p_market_price numeric,p_close_reason text,p_fee_rate_percent numeric)` | jsonb | 증거금 반환과 실현손익·수수료 정산 |

RPC는 `SECURITY INVOKER`이며 PUBLIC 실행 권한이 없다. 함수 호출은 shared adapter에서 허용 목록·이름 지정 매개변수로만 수행한다.

## 원본 함수가 없어 명시적으로 선택한 회계 규칙

- 고정 paper: 양방향 모두 1배 담보 방식. 현금 예산 = 진입 전 가용 현금 × position size %. 예산 안에서 진입 수수료를 빼고 수량을 산출한다. 진입 시 notional+fee를 현금에서 차감한다.
- 고정 paper의 entry/exit 가격에 설정된 불리한 방향의 slippage를 적용한다. 청산 시 담보 + 방향성 손익 − exit fee를 반환한다. 총 수수료는 entry+exit, net PnL은 gross−두 수수료다.
- adaptive: 가용 현금에서 margin+entry fee를 차감하고 reserved margin을 증가시킨다. `notional=margin×leverage=price×quantity` 및 현재 현금에 대한 margin %를 검증한다.
- adaptive 청산 시 margin을 반환하고 reserved margin을 감소시킨다. `return_on_margin_percent`와 진입 당시 계정 자산 기준 `return_on_equity_percent`를 별도로 저장한다.
- 급격한 가격 gap으로 담보 이상 손실이 나면 담보 한도로 손실을 제한하고 남은 담보 범위 내에서만 exit fee를 부과한다. 추가 차입을 만드는 모델은 사용하지 않는다.
- 중복 청산은 `skipped`를 반환하고 두 번째 거래나 계정 변화를 만들지 않는다. 금액 검증 실패는 예외로 전체 문장이 롤백된다.

위 규칙은 원본 SQL과 동일하다고 주장하지 않는다. PostgreSQL 18.2에서 LONG/SHORT·동시 진입/청산·소유권·수수료·잔액 보존을 테스트했고, 버디4 복원 테스트에서 별도로 승인해야 한다.
