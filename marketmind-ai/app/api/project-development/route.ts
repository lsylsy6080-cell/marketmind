import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BuildState =
  | "success"
  | "building"
  | "failed"
  | "ready"
  | "unknown";

type GitHubCommitResponse = {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
      date?: string;
    };
  };
  author?: {
    login?: string;
  } | null;
};

type VercelDeployment = {
  uid?: string;
  name?: string;
  url?: string;
  state?: string;
  readyState?: string;
  created?: number;
  createdAt?: number;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
  };
  target?: string | null;
};

function mapVercelState(value?: string): BuildState {
  const state = value?.toUpperCase();

  if (state === "READY") return "success";
  if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING") {
    return "building";
  }
  if (
    state === "ERROR" ||
    state === "CANCELED" ||
    state === "CANCELLED"
  ) {
    return "failed";
  }

  return "unknown";
}

async function getGithubData() {
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_BRANCH ?? "main";
  const token = process.env.GITHUB_TOKEN;

  if (!repository) {
    return {
      repository: "저장소 미설정",
      branch,
      commits: [],
      error: "GITHUB_REPOSITORY 환경변수가 설정되지 않았습니다.",
    };
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/commits?sha=${encodeURIComponent(
      branch,
    )}&per_page=6`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (!response.ok) {
    return {
      repository,
      branch,
      commits: [],
      error: `GitHub API HTTP ${response.status}`,
    };
  }

  const commits = (await response.json()) as GitHubCommitResponse[];

  return {
    repository,
    branch,
    commits: commits.map((item) => ({
      sha: item.sha,
      message:
        item.commit?.message?.split("\n")[0] ?? "커밋 메시지 없음",
      author:
        item.author?.login ??
        item.commit?.author?.name ??
        "알 수 없는 작성자",
      committedAt:
        item.commit?.author?.date ?? new Date().toISOString(),
      url: item.html_url,
    })),
  };
}

async function getVercelData(defaultBranch: string) {
  const token = process.env.VERCEL_ACCESS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId) {
    return {
      build: null,
      error:
        "VERCEL_ACCESS_TOKEN 또는 VERCEL_PROJECT_ID가 설정되지 않았습니다.",
    };
  }

  const query = new URLSearchParams({
    projectId,
    limit: "10",
  });

  if (teamId) query.set("teamId", teamId);

  const response = await fetch(
    `https://api.vercel.com/v6/deployments?${query.toString()}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    return {
      build: null,
      error: `Vercel API HTTP ${response.status}`,
    };
  }

  const payload = (await response.json()) as {
    deployments?: VercelDeployment[];
  };

  const deployments = payload.deployments ?? [];
  const latest = deployments[0];

  if (!latest) {
    return {
      build: null,
      error: "Vercel 배포 기록이 없습니다.",
    };
  }

  const production = deployments.find(
    (item) => item.target === "production",
  );
  const preview = deployments.find(
    (item) => item.target !== "production",
  );

  const makeEnvironment = (
    name: string,
    deployment?: VercelDeployment,
  ) => ({
    name,
    state: mapVercelState(
      deployment?.readyState ?? deployment?.state,
    ),
    detail:
      deployment?.meta?.githubCommitMessage ??
      deployment?.name ??
      "배포 정보 없음",
    updatedAt: deployment
      ? new Date(
          deployment.createdAt ??
            deployment.created ??
            Date.now(),
        ).toISOString()
      : undefined,
    url: deployment?.url
      ? `https://${deployment.url}`
      : undefined,
  });

  const latestState = mapVercelState(
    latest.readyState ?? latest.state,
  );

  return {
    build: {
      latestState,
      latestLabel:
        latest.meta?.githubCommitMessage ??
        latest.name ??
        "Latest deployment",
      latestUpdatedAt: new Date(
        latest.createdAt ?? latest.created ?? Date.now(),
      ).toISOString(),
      branch:
        latest.meta?.githubCommitRef ?? defaultBranch,
      commitSha: latest.meta?.githubCommitSha,
      environments: [
        makeEnvironment("Production", production),
        makeEnvironment("Preview", preview),
      ],
    },
  };
}

export async function GET() {
  const git = await getGithubData();
  const deployment = await getVercelData(git.branch);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      git,
      ...deployment,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
