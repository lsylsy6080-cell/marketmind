import { DashboardTopbar } from "@/dashboard/components/DashboardTopbar";
import ProjectLayout from "@/components/project-center/ProjectLayout";
import { getProjectAiDecisionData } from "@/lib/project-center/getProjectAiDecisionData";
import { getProjectDevelopmentData } from "@/lib/project-center/getProjectDevelopmentData";
import { getProjectHealthData } from "@/lib/project-center/getProjectHealthData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectCenterPage() {
  const [health, development, aiDecision] = await Promise.all([
    getProjectHealthData(),
    getProjectDevelopmentData(),
    getProjectAiDecisionData(),
  ]);

  const updatedAt = [
    health.checkedAt,
    development.checkedAt,
    aiDecision.checkedAt,
  ].sort().at(-1) ?? health.checkedAt;

  return (
    <main className="page-shell">
      <div className="terminal">
        <DashboardTopbar active="project-center" updatedAt={updatedAt} />

        <ProjectLayout
          services={health.services}
          activities={health.activities}
          checkedAt={updatedAt}
          healthError={health.error}
          repository={development.git.repository}
          branch={development.git.branch}
          commits={development.git.commits}
          gitError={development.git.error}
          build={development.build}
          buildError={development.error}
          aiDecision={aiDecision.current}
          aiDecisionHistory={aiDecision.history}
          aiDecisionSource={aiDecision.source}
          aiDecisionError={aiDecision.error}
        />

        <footer className="terminal-footer">
          <span>MarketMind AI · Project Center v5.5</span>
          <span>Phase 5 Complete · Safe Data Collection Active</span>
        </footer>
      </div>
    </main>
  );
}
