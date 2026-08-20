import path from "node:path";
import fs from "node:fs/promises";
import { SNAPSHOTS_DIR } from "../data/paths.js";
import { validateAndApplyArtifact } from "./artifact.js";
import { loadSourceRegistry } from "./registry.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function appendOutputs(changed: number, errors: number): Promise<void> {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  await fs.appendFile(
    output,
    `has_changes=${changed > 0}\nchanged_count=${changed}\nhas_errors=${errors > 0}\nerror_count=${errors}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const artifact = argument("--artifact");
  if (!artifact) throw new Error("--artifact needs a path");
  const { registry, issues } = await loadSourceRegistry();
  if (!registry || issues.length > 0)
    throw new Error(issues.map((issue) => issue.message).join("; "));
  const result = await validateAndApplyArtifact(registry, path.resolve(artifact), SNAPSHOTS_DIR);
  await appendOutputs(result.changed, result.errors);
  console.log(`Artifact valid: ${result.changed} changed, ${result.errors} failed.`);
}

main().catch((error) => {
  console.error(`Artifact validation failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
