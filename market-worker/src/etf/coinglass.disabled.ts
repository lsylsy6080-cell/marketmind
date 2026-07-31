/**
 * CoinGlass 수집기는 현재 비활성화되어 있습니다.
 *
 * 이 파일은 과거 구현을 보존하기 위한 자리표시자이며,
 * 현재 ETF 수집기는 `farside.ts`를 사용합니다.
 */
export async function fetchEtfPayload(): Promise<never> {
  throw new Error(
    "CoinGlass ETF 수집기는 비활성화되어 있습니다. ETF_SOURCE=farside를 사용하세요.",
  );
}
