import type {
  ActivityItem,
} from "@/components/project-center/ActivityFeedCard";
import type {
  DevelopmentService,
} from "@/components/project-center/DevelopmentStatusCard";
import { headers } from "next/headers";

export type ProjectHealthData = {
  ok: boolean;
  checkedAt: string;
  services: DevelopmentService[];
  activities: ActivityItem[];
  error?: string;
};

const fallbackServices: DevelopmentService[] = [
  {
    name: "데이터베이스",
    description: "Vercel과 Supabase 연결 상태",
    status: "warning",
    detail: "상태 확인 실패",
  },
  {
    name: "Market Worker",
    description: "외부 워커의 최근 BTC 캔들 저장 상태",
    status: "warning",
    detail: "상태 확인 실패",
  },
  {
    name: "AI 분석",
    description: "최근 AI Decision 생성 상태",
    status: "warning",
    detail: "상태 확인 실패",
  },
];

export async function getProjectHealthData(): Promise<ProjectHealthData> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");

    if (!host) {
      throw new Error("현재 호스트를 확인할 수 없습니다.");
    }

    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (process.env.NODE_ENV === "production" ? "https" : "http");

    const response = await fetch(`${protocol}://${host}/api/project-health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`프로젝트 상태 API HTTP ${response.status}`);
    }

    return (await response.json()) as ProjectHealthData;
  } catch (error) {
    const checkedAt = new Date().toISOString();

    return {
      ok: false,
      checkedAt,
      services: fallbackServices,
      activities: [
        {
          time: new Intl.DateTimeFormat("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Seoul",
          }).format(new Date(checkedAt)),
          source: "Project Center",
          message:
            error instanceof Error
              ? error.message
              : "프로젝트 상태를 불러오지 못했습니다.",
          status: "확인 필요",
          tone: "warning",
        },
      ],
      error:
        error instanceof Error
          ? error.message
          : "프로젝트 상태를 불러오지 못했습니다.",
    };
  }
}
