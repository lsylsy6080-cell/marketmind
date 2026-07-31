import type {
  BuildSummary,
} from "@/components/project-center/BuildCenterCard";
import type {
  GitCommitItem,
} from "@/components/project-center/GitTimelineCard";
import { headers } from "next/headers";

export type ProjectDevelopmentData = {
  checkedAt: string;
  git: {
    repository: string;
    branch: string;
    commits: GitCommitItem[];
    error?: string;
  };
  build: BuildSummary | null;
  error?: string;
};

export async function getProjectDevelopmentData(): Promise<ProjectDevelopmentData> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");

    if (!host) {
      throw new Error("현재 호스트를 확인할 수 없습니다.");
    }

    const protocol =
      requestHeaders.get("x-forwarded-proto") ??
      (process.env.NODE_ENV === "production" ? "https" : "http");

    const response = await fetch(
      `${protocol}://${host}/api/project-development`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`개발 현황 API HTTP ${response.status}`);
    }

    return (await response.json()) as ProjectDevelopmentData;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "개발 현황을 불러오지 못했습니다.";

    return {
      checkedAt: new Date().toISOString(),
      git: {
        repository: "확인 실패",
        branch: "main",
        commits: [],
        error: message,
      },
      build: null,
      error: message,
    };
  }
}
