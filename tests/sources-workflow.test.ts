import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

const file = new URL("../.github/workflows/sources.yml", import.meta.url);

describe("source snapshot workflow", () => {
  it("keeps fetching credential-free and validates before publishing", async () => {
    const workflow = await fs.readFile(file, "utf8");
    expect(workflow).toContain("permissions: {}\n");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow.indexOf("Validate artifact before credentials")).toBeLessThan(
      workflow.indexOf("Update source failure issues"),
    );
    expect(workflow).not.toContain("ANTHROPIC_API_KEY");
    expect(workflow).not.toContain("claude-code-action");
  });

  it("pins actions and uses one stable draft PR branch", async () => {
    const workflow = await fs.readFile(file, "utf8");
    const uses = [...workflow.matchAll(/uses: [^@\n]+@([^\s#]+)/g)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((reference) => /^[a-f0-9]{40}$/.test(reference!))).toBe(true);
    expect(workflow).toContain("branch: automation/source-snapshots");
    expect(workflow).toContain("draft: true");
    expect(workflow).toContain("add-paths: snapshots/**/*.md");
  });
});
