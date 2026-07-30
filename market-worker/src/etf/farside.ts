import * as cheerio from "cheerio";

export interface FarsideEtfDetail {
  ticker: string;
  flowUsd: number;
}

export interface FarsideEtfRow {
  flowDate: string;
  totalFlowUsd: number;
  details: FarsideEtfDetail[];
  rawData: Record<string, string | number | null>;
}

const DEFAULT_URL =
  "https://farside.co.uk/bitcoin-etf-flow-all-data/";

const DATE_PATTERN = /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/;

/**
 * Farside 값은 US$m 단위다.
 *
 * 111.7   → 111,700,000달러
 * (95.1)  → -95,100,000달러
 * -       → null
 */
function parseMillions(value: string): number | null {
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/,/g, "")
    .trim();

  if (
    normalized === "" ||
    normalized === "-" ||
    normalized.toLowerCase() === "n/a"
  ) {
    return null;
  }

  const isNegative =
    normalized.startsWith("(") && normalized.endsWith(")");

  const numericText = normalized.replace(/[()]/g, "");
  const numberValue = Number(numericText);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  const usdValue = numberValue * 1_000_000;

  return isNegative ? -usdValue : usdValue;
}

function parseFarsideDate(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!DATE_PATTERN.test(normalized)) {
    return null;
  }

  const match = normalized.match(
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/,
  );

  if (!match) {
    return null;
  }

  const [, day, monthText, year] = match;

  const monthMap: Record<string, number> = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12,
  };

  const normalizedMonth =
    monthText.charAt(0).toUpperCase() +
    monthText.slice(1).toLowerCase();

  const month = monthMap[normalizedMonth];

  if (!month) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export async function fetchFarsideEtfRows(): Promise<FarsideEtfRow[]> {
  const sourceUrl = process.env.FARSIDE_ETF_URL || DEFAULT_URL;
  const readerUrl = `https://r.jina.ai/${sourceUrl}`;

  const response = await fetch(readerUrl, {
  headers: {
    accept: "text/html",
    "x-respond-with": "html",
  },
  signal: AbortSignal.timeout(60_000),
});

  if (!response.ok) {
    throw new Error(
      `Farside Reader 요청 실패: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const tables = $("table").toArray();

  for (const table of tables) {
    const rows = $(table).find("tr").toArray();

    if (rows.length < 2) {
      continue;
    }

    const headerCells = $(rows[0])
      .find("th, td")
      .map((_, element) => normalizeHeader($(element).text()))
      .get();

    const dateIndex = headerCells.findIndex(
      (header) => header === "DATE",
    );
    const totalIndex = headerCells.findIndex(
      (header) => header === "TOTAL",
    );

    if (dateIndex === -1 || totalIndex === -1) {
      continue;
    }

    const tickerIndexes = headerCells
  .map((header, index) => ({ ticker: header, index }))
  .filter(
    ({ ticker, index }) =>
      index !== dateIndex &&
      index !== totalIndex &&
      ticker !== "" &&
      ticker !== "DATE" &&
      ticker !== "TOTAL" &&
      ticker !== "BTC",
  );

    const parsedRows: FarsideEtfRow[] = [];

    for (const row of rows.slice(1)) {
      const cells = $(row)
        .find("th, td")
        .map((_, element) =>
          $(element)
            .text()
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .get();

      if (cells.length <= totalIndex) {
        continue;
      }

      const flowDate = parseFarsideDate(cells[dateIndex] ?? "");

      if (!flowDate) {
        continue;
      }

      const details = tickerIndexes
        .map(({ ticker, index }) => ({
          ticker,
          flowUsd: parseMillions(cells[index] ?? ""),
        }))
        .filter(
          (
            detail,
          ): detail is {
            ticker: string;
            flowUsd: number;
          } => detail.flowUsd !== null,
        );

      /*
       * 아직 데이터가 들어오지 않은 신규 날짜는
       * 모든 ETF 칸이 '-'이고 Total만 0.0일 수 있다.
       * 이런 행은 확정 데이터로 저장하지 않는다.
       */
      if (details.length === 0) {
        continue;
      }

      const displayedTotal = parseMillions(cells[totalIndex] ?? "");

      const calculatedTotal = details.reduce(
        (sum, detail) => sum + detail.flowUsd,
        0,
      );

      const totalFlowUsd = displayedTotal ?? calculatedTotal;

      const rawData: Record<string, string | number | null> = {
        date: cells[dateIndex] ?? "",
        total: cells[totalIndex] ?? "",
      };

      for (const { ticker, index } of tickerIndexes) {
        rawData[ticker] = cells[index] ?? null;
      }

      parsedRows.push({
        flowDate,
        totalFlowUsd,
        details,
        rawData,
      });
    }

    if (parsedRows.length > 0) {
      return parsedRows.sort((a, b) =>
        a.flowDate.localeCompare(b.flowDate),
      );
    }
  }

  throw new Error(
    "Farside ETF 데이터 표를 찾지 못했습니다. 페이지 구조가 변경됐을 수 있습니다.",
  );
}