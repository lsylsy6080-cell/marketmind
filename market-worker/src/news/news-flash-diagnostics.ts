export interface FlashMismatchDiagnostic {
  id: number;
  source: string;
  title: string;
  category: string;
}

export interface FlashMismatchReport {
  total: number;
  bySource: Array<{ source: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  items: FlashMismatchDiagnostic[];
}

function rank(map: Map<string, number>, key: "source" | "category") {
  return [...map.entries()]
    .map(([name, count]) => ({ [key]: name, count }))
    .sort((a, b) => Number(b.count) - Number(a.count) || String(a[key]).localeCompare(String(b[key])));
}

export function buildFlashMismatchReport(
  rows: FlashMismatchDiagnostic[],
  maxItems = 30,
): FlashMismatchReport {
  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const row of rows) {
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
    categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
  }

  return {
    total: rows.length,
    bySource: rank(sourceCounts, "source") as Array<{ source: string; count: number }>,
    byCategory: rank(categoryCounts, "category") as Array<{ category: string; count: number }>,
    items: rows.slice(0, Math.max(1, Math.min(100, maxItems))),
  };
}

export function formatFlashMismatchReport(report: FlashMismatchReport): string[] {
  if (report.total === 0) {
    return ["[뉴스패턴진단] 패턴 미일치 기사 없음"];
  }

  const lines: string[] = [];
  lines.push(`[뉴스패턴진단] 미일치 ${report.total}건`);
  lines.push(
    `[뉴스패턴진단] 출처별 · ${report.bySource
      .map((item) => `${item.source}=${item.count}`)
      .join(" · ")}`,
  );
  lines.push(
    `[뉴스패턴진단] 분류별 · ${report.byCategory
      .map((item) => `${item.category}=${item.count}`)
      .join(" · ")}`,
  );

  report.items.forEach((item, index) => {
    lines.push(
      `[뉴스패턴진단 ${index + 1}/${report.total}] ${item.source} · ${item.category} · ${item.title}`,
    );
  });

  if (report.items.length < report.total) {
    lines.push(
      `[뉴스패턴진단] ${report.total - report.items.length}건은 로그 길이 제한으로 생략`,
    );
  }

  return lines;
}
