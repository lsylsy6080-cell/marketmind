import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Center | MarketMind AI",
  description: "MarketMind AI 개발 진행률과 시스템 상태를 관리하는 프로젝트 관제센터",
};

export default function ProjectCenterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
