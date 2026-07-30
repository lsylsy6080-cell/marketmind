import { config } from "./config";

export async function fetchEtfPayload(): Promise<unknown> {
  const url = new URL(config.coinglassEtfPath, config.coinglassBaseUrl);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      [config.coinglassApiKeyHeader]: config.coinglassApiKey,
    },
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CoinGlass HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`CoinGlass 응답이 JSON이 아닙니다: ${text.slice(0, 1000)}`);
  }
}
