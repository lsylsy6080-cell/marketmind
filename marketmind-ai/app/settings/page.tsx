import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import ProjectLayout from "@/components/project-center/ProjectLayout";
import { getProjectAiDecisionData } from "@/lib/project-center/getProjectAiDecisionData";
import { getProjectHealthData } from "@/lib/project-center/getProjectHealthData";
export const dynamic="force-dynamic";export const revalidate=0;
export default async function SettingsPage(){const [health,aiDecision]=await Promise.all([getProjectHealthData(),getProjectAiDecisionData()]);const updatedAt=[health.checkedAt,aiDecision.checkedAt].sort().at(-1)??health.checkedAt;return <MarketMindShell active="settings" updatedAt={updatedAt} workerUpdatedAt={health.checkedAt}><div className="terminal mock-terminal mock-settings"><ProjectLayout services={health.services} checkedAt={updatedAt} healthError={health.error} aiDecision={aiDecision.current} aiDecisionHistory={aiDecision.history} aiDecisionSource={aiDecision.source} aiDecisionError={aiDecision.error}/></div></MarketMindShell>}
