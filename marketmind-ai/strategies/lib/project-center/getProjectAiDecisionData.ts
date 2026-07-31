import type { AiDecisionSnapshot } from "@/components/project-center/AiDecisionMonitorCard";
import { headers } from "next/headers";

export type ProjectAiDecisionData = {
  ok: boolean;
  checkedAt: string;
  source: string;
  current: AiDecisionSnapshot | null;
  history: AiDecisionSnapshot[];
  error?: string;
};

export async function getProjectAiDecisionData(): Promise<ProjectAiDecisionData> {
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
      `${protocol}://${host}/api/project-ai-decision`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error(`AI Decision API HTTP ${response.status}`);
    }

    return (await response.json()) as ProjectAiDecisionData;
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      source: "fallback",
      current: null,
      history: [],
      error:
        error instanceof Error
          ? error.message
          : "AI 판단 데이터를 불러오지 못했습니다.",
    };
  }
}
