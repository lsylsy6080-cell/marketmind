import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthState = "healthy" | "warning" | "offline" | "developing";
type ActivityTone = "success" | "info" | "waiting" | "warning";

type ServiceResult = {
  name: string;
  description: string;
  status: HealthState;
  detail: string;
  latencyMs?: number;
  checkedAt: string;
};

type ActivityResult = {
  time: string;
  source: string;
  message: string;
  status: string;
  tone: ActivityTone;
};

function nowIso() {
  return new Date().toISOString();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function ageMinutes(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 60000);
}

function freshnessStatus(minutes: number): HealthState {
  if (minutes <= 2.5) return "healthy";
  if (minutes <= 6) return "warning";
  return "offline";
}

function freshnessDetail(minutes: number, label: string) {
  if (!Number.isFinite(minutes)) return `${label} 없음`;
  if (minutes < 1) return `${label} 방금 전`;
  return `${label} ${Math.floor(minutes)}분 전`;
}

function createActivities(services: ServiceResult[]): ActivityResult[] {
  return services.map((service) => {
    const tone: ActivityTone =
      service.status === "healthy"
        ? "success"
        : service.status === "developing"
          ? "waiting"
          : "warning";

    return {
      time: formatTime(service.checkedAt),
      source: service.name,
      message: service.detail,
      status:
        service.status === "healthy"
          ? "정상"
          : service.status === "warning"
            ? "지연"
            : service.status === "offline"
              ? "중단"
              : "설정 필요",
      tone,
    };
  });
}

export async function GET() {
  const checkedAt = nowIso();

  try {
    const supabase = createAdminClient();
    const started = performance.now();

    const [candleResult, decisionResult] = await Promise.all([
      supabase
        .from("market_candles")
        .select("open_time")
        .eq("exchange", "binance")
        .eq("market_type", "spot")
        .eq("symbol", "BTCUSDT")
        .eq("timeframe", "1m")
        .eq("is_closed", true)
        .order("open_time", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("final_market_decisions")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const latencyMs = Math.round(performance.now() - started);

    if (candleResult.error) throw candleResult.error;

    const candleAt = candleResult.data?.open_time ?? null;
    const workerAge = ageMinutes(candleAt);
    const workerStatus = freshnessStatus(workerAge);

    const services: ServiceResult[] = [
      {
        name: "데이터베이스",
        description: "Vercel과 Supabase 연결 상태",
        status: latencyMs >= 2500 ? "warning" : "healthy",
        detail: latencyMs >= 2500 ? `응답 지연 · ${latencyMs}ms` : `연결 정상 · ${latencyMs}ms`,
        latencyMs,
        checkedAt,
      },
      {
        name: "Market Worker",
        description: "외부 워커의 최근 BTC 캔들 저장 상태",
        status: workerStatus,
        detail: freshnessDetail(workerAge, "마지막 수집"),
        checkedAt,
      },
      {
        name: "AI 분석",
        description: "최근 AI Decision 생성 상태",
        status: decisionResult.error
          ? "warning"
          : freshnessStatus(ageMinutes(decisionResult.data?.created_at ?? null)),
        detail: decisionResult.error
          ? "판단 기록 확인 실패"
          : freshnessDetail(ageMinutes(decisionResult.data?.created_at ?? null), "마지막 판단"),
        checkedAt,
      },
    ];

    return NextResponse.json(
      {
        ok: services.every((service) => service.status === "healthy"),
        checkedAt,
        services,
        activities: createActivities(services),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "상태 확인 실패";
    const services: ServiceResult[] = [
      {
        name: "데이터베이스",
        description: "Vercel과 Supabase 연결 상태",
        status: "offline",
        detail: "연결 확인 실패",
        checkedAt,
      },
      {
        name: "Market Worker",
        description: "외부 워커의 최근 BTC 캔들 저장 상태",
        status: "warning",
        detail: "DB 연결 후 확인 가능",
        checkedAt,
      },
      {
        name: "AI 분석",
        description: "최근 AI Decision 생성 상태",
        status: "warning",
        detail: "DB 연결 후 확인 가능",
        checkedAt,
      },
    ];

    return NextResponse.json(
      {
        ok: false,
        checkedAt,
        services,
        activities: createActivities(services),
        error: message,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
