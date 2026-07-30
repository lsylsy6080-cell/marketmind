import { config } from "./config";
import type { EtfFlowDetail, EtfFlowRecord } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateValue(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const raw = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(raw)
    ? new Date(raw < 10_000_000_000 ? raw * 1000 : raw)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`날짜 변환 실패: ${String(value)}`);
  return date.toISOString().slice(0, 10);
}

function rowsFrom(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isObj(payload)) return [];
  for (const candidate of [payload.data, payload.result, payload.rows, payload.list]) {
    if (Array.isArray(candidate)) return candidate;
    if (isObj(candidate)) {
      for (const key of ["data", "list", "rows", "items"]) {
        if (Array.isArray(candidate[key])) return candidate[key] as unknown[];
      }
    }
  }
  return [];
}

function pick(row: Obj, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
}

function detailsFrom(row: Obj): EtfFlowDetail[] {
  const raw = pick(row, ["details", "funds", "etf_list", "etfList", "ticker_flows"]);
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    if (!isObj(item)) return [];
    const ticker = String(pick(item, ["ticker", "symbol", "fund", "name"]) ?? "")
      .trim()
      .toUpperCase();
    const flowUsd = numberValue(
      pick(item, ["flow_usd", "flowUsd", "net_flow", "netFlow", "value"]),
    );
    return ticker && flowUsd !== null ? [{ ticker, flowUsd }] : [];
  });
}

export function parseEtfPayload(payload: unknown): EtfFlowRecord[] {
  const rows = rowsFrom(payload);
  if (!rows.length) {
    throw new Error("ETF 행 배열을 찾지 못했습니다. 실제 응답에 맞게 parser.ts를 조정하세요.");
  }

  return rows.map((raw, index) => {
    if (!isObj(raw)) throw new Error(`${index + 1}번째 ETF 행이 객체가 아닙니다.`);

    const rawDate = pick(raw, ["flow_date", "flowDate", "date", "timestamp", "time"]);
    const rawTotal = pick(raw, [
      "total_flow_usd",
      "totalFlowUsd",
      "total_net_flow",
      "totalNetFlow",
      "net_flow",
      "netFlow",
      "flow",
    ]);

    const totalFlowUsd = numberValue(rawTotal);
    if (rawDate === undefined || totalFlowUsd === null) {
      throw new Error(`${index + 1}번째 ETF 행의 날짜 또는 총 흐름 값이 없습니다.`);
    }

    return {
      asset: config.asset,
      market: config.market,
      flowDate: dateValue(rawDate),
      totalFlowUsd,
      priceUsd: numberValue(pick(raw, ["price_usd", "priceUsd", "price", "close"])),
      source: config.source,
      sourceTimestamp: null,
      rawData: raw,
      details: detailsFrom(raw),
    };
  });
}
