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

const DEFAULT_TIMEOUT_MS = 5000;

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

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    return {
      response,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHttpService(options: {
  name: string;
  description: string;
  url?: string;
  headers?: HeadersInit;
  successDetail: string;
  missingDetail: string;
}): Promise<ServiceResult> {
  const checkedAt = nowIso();

  if (!options.url) {
    return {
      name: options.name,
      description: options.description,
      status: "developing",
      detail: options.missingDetail,
      checkedAt,
    };
  }

  try {
    const { response, latencyMs } = await timedFetch(options.url, {
      headers: options.headers,
    });

    if (response.ok) {
      return {
        name: options.name,
        description: options.description,
        status: latencyMs >= 2500 ? "warning" : "healthy",
        detail:
          latencyMs >= 2500
            ? `응답 지연 · ${latencyMs}ms`
            : `${options.successDetail} · ${latencyMs}ms`,
        latencyMs,
        checkedAt,
      };
    }

    return {
      name: options.name,
      description: options.description,
      status: response.status >= 500 ? "offline" : "warning",
      detail: `HTTP ${response.status} · ${latencyMs}ms`,
      latencyMs,
      checkedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "응답 시간 초과"
        : "연결 실패";

    return {
      name: options.name,
      description: options.description,
      status: "offline",
      detail: message,
      checkedAt,
    };
  }
}

async function checkSupabase(): Promise<ServiceResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return {
      name: "데이터베이스",
      description: "시장·뉴스·분석 데이터 저장소",
      status: "developing",
      detail: "Supabase 환경변수 미설정",
      checkedAt: nowIso(),
    };
  }

  return checkHttpService({
    name: "데이터베이스",
    description: "시장·뉴스·분석 데이터 저장소",
    url: `${url}/rest/v1/market_intelligence_scores?select=id&limit=1`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    successDetail: "연결 정상",
    missingDetail: "Supabase 환경변수 미설정",
  });
}

function createActivities(services: ServiceResult[]): ActivityResult[] {
  return services.map((service) => {
    const tone: ActivityTone =
      service.status === "healthy"
        ? "success"
        : service.status === "warning"
          ? "warning"
          : service.status === "offline"
            ? "warning"
            : "waiting";

    return {
      time: formatTime(service.checkedAt),
      source: service.name,
      message: service.detail,
      status:
        service.status === "healthy"
          ? "정상"
          : service.status === "warning"
            ? "주의"
            : service.status === "offline"
              ? "중단"
              : "설정 필요",
      tone,
    };
  });
}

export async function GET() {
  const workerHealthUrl =
    process.env.MARKET_WORKER_HEALTH_URL ??
    process.env.NEXT_PUBLIC_MARKET_WORKER_HEALTH_URL;

  const marketApiHealthUrl =
    process.env.MARKET_API_HEALTH_URL ??
    process.env.NEXT_PUBLIC_MARKET_API_HEALTH_URL;

  const intelligenceHealthUrl =
    process.env.INTELLIGENCE_HEALTH_URL ??
    process.env.NEXT_PUBLIC_INTELLIGENCE_HEALTH_URL;

  const services = await Promise.all([
    checkHttpService({
      name: "API",
      description: "시장 데이터 및 분석 API",
      url: marketApiHealthUrl,
      successDetail: "정상 응답",
      missingDetail: "MARKET_API_HEALTH_URL 미설정",
    }),
    checkSupabase(),
    checkHttpService({
      name: "수집 워커",
      description: "펀딩비·ETF·뉴스 수집 프로세스",
      url: workerHealthUrl,
      successDetail: "수집 프로세스 응답",
      missingDetail: "MARKET_WORKER_HEALTH_URL 미설정",
    }),
    checkHttpService({
      name: "AI 분석",
      description: "시장 인텔리전스 분석 엔진",
      url: intelligenceHealthUrl,
      successDetail: "분석 엔진 응답",
      missingDetail: "INTELLIGENCE_HEALTH_URL 미설정",
    }),
  ]);

  const checkedAt = nowIso();
  const healthyCount = services.filter(
    (service) => service.status === "healthy",
  ).length;

  return NextResponse.json(
    {
      ok: healthyCount === services.length,
      checkedAt,
      services,
      activities: createActivities(services),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
