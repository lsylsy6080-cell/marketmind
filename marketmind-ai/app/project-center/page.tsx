import { DashboardTopbar } from "@/dashboard/components/DashboardTopbar";
import ProjectLayout from "@/components/project-center/ProjectLayout";
import { getProjectDevelopmentData } from "@/lib/project-center/getProjectDevelopmentData";
import { getProjectHealthData } from "@/lib/project-center/getProjectHealthData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProjectCenterPage() {
  const [health, development] = await Promise.all([
    getProjectHealthData(),
    getProjectDevelopmentData(),
  ]);

  const updatedAt =
    development.checkedAt > health.checkedAt
      ? development.checkedAt
      : health.checkedAt;

  return (
    <main className="page-shell">
      <div className="terminal">
        <DashboardTopbar
          active="project-center"
          updatedAt={updatedAt}
        />

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
        />

        <footer className="terminal-footer">
          <span>MarketMind AI · Project Center v2.2</span>
          <span>System Health · Git Timeline · Build Center</span>
        </footer>
      </div>
    </main>
  );
}
