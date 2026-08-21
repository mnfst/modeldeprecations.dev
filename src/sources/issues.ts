import type { SourceReport } from "./report.js";

export interface ExistingIssue {
  number: number;
  state: "open" | "closed";
  body: string;
}

export type IssueAction =
  | { type: "create"; title: string; body: string }
  | { type: "update"; number: number; body?: string; state?: "open" | "closed" }
  | { type: "comment"; number: number; body: string };

function marker(provider: string, slug: string): string {
  return `<!-- source-fetch:${provider}/${slug} -->`;
}

function failureBody(
  result: Extract<SourceReport["results"][number], { status: "error" }>,
  date: string,
): string {
  return `${marker(result.provider, result.slug)}

Source: \`${result.provider}/${result.slug}\`
URL: ${result.url}
Last failure: ${date} UTC
Error: \`${result.error_code}\`

The committed snapshot was preserved.`;
}

export function planIssueActions(report: SourceReport, existing: ExistingIssue[]): IssueAction[] {
  const actions: IssueAction[] = [];
  const date = report.started_at.slice(0, 10);

  for (const result of report.results) {
    const found = existing.find((issue) =>
      issue.body.includes(marker(result.provider, result.slug)),
    );
    if (result.status === "error") {
      const body = failureBody(result, date);
      if (!found) {
        actions.push({
          type: "create",
          title: `Source fetch failing: ${result.provider}/${result.slug}`,
          body,
        });
      } else if (found.state === "closed") {
        actions.push({ type: "update", number: found.number, body, state: "open" });
        actions.push({
          type: "comment",
          number: found.number,
          body: `Failure recurred on ${date} UTC.`,
        });
      } else {
        actions.push({ type: "update", number: found.number, body });
      }
    } else if (found?.state === "open") {
      actions.push({
        type: "comment",
        number: found.number,
        body: `Source recovered on ${date} UTC.`,
      });
      actions.push({ type: "update", number: found.number, state: "closed" });
    }
  }
  return actions;
}
