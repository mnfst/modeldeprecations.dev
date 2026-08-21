import fs from "node:fs/promises";
import { planIssueActions, type ExistingIssue, type IssueAction } from "./issues.js";
import { SourceReportSchema } from "./report.js";

class GitHubApiError extends Error {
  constructor(readonly status: number) {
    super(`GitHub API returned HTTP ${status}`);
  }
}

interface GitHubIssueResponse {
  number: number;
  state: "open" | "closed";
  body: string | null;
  pull_request?: unknown;
}

async function request<T>(
  endpoint: string,
  token: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "modeldeprecations.dev source monitor/1.0",
      "x-github-api-version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new GitHubApiError(response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function ensureLabel(repo: string, token: string): Promise<void> {
  try {
    await request(`/repos/${repo}/labels/source-fetch`, token);
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    await request(`/repos/${repo}/labels`, token, "POST", {
      name: "source-fetch",
      color: "d4c5f9",
      description: "Automated provider source fetch failure",
    });
  }
}

async function existingIssues(repo: string, token: string): Promise<ExistingIssue[]> {
  const results = await request<GitHubIssueResponse[]>(
    `/repos/${repo}/issues?state=all&labels=source-fetch&per_page=100`,
    token,
  );
  return results
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({ number: issue.number, state: issue.state, body: issue.body ?? "" }));
}

async function applyAction(repo: string, token: string, action: IssueAction): Promise<void> {
  if (action.type === "create") {
    await request(`/repos/${repo}/issues`, token, "POST", {
      title: action.title,
      body: action.body,
      labels: ["source-fetch"],
    });
    return;
  }
  if (action.type === "comment") {
    await request(`/repos/${repo}/issues/${action.number}/comments`, token, "POST", {
      body: action.body,
    });
    return;
  }
  await request(`/repos/${repo}/issues/${action.number}`, token, "PATCH", {
    ...(action.body === undefined ? {} : { body: action.body }),
    ...(action.state === undefined ? {} : { state: action.state }),
  });
}

async function main(): Promise<void> {
  const reportIndex = process.argv.indexOf("--report");
  const reportFile = reportIndex === -1 ? undefined : process.argv[reportIndex + 1];
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!reportFile) throw new Error("--report needs a path");
  if (!token || !repo) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");
  const report = SourceReportSchema.parse(JSON.parse(await fs.readFile(reportFile, "utf8")));
  await ensureLabel(repo, token);
  const actions = planIssueActions(report, await existingIssues(repo, token));
  for (const action of actions) await applyAction(repo, token, action);
  console.log(`Source issue sync complete: ${actions.length} action(s).`);
}

main().catch((error) => {
  console.error(`Source issue sync failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
