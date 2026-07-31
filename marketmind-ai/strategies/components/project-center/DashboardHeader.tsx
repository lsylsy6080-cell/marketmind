type DashboardHeaderProps = {
  title: string;
  phase: string;
  version: string;
  updatedAt: string;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function DashboardHeader({ title, phase, version, updatedAt }: DashboardHeaderProps) {
  return (
    <section className="page-heading">
      <div>
        <span className="section-kicker">PROJECT OPERATIONS</span>
        <h1>{title}</h1>
        <p>개발 진행률, 시스템 상태와 다음 우선순위를 한 화면에서 관리합니다.</p>
      </div>
      <div aria-label="프로젝트 메타 정보">
        <span>{phase}</span>
        <strong>v{version}</strong>
        <small>{dateFormatter.format(new Date(updatedAt))} 업데이트</small>
      </div>
    </section>
  );
}
