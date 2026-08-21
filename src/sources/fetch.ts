import path from "node:path";
import { SOURCE_FETCH_DIR, SNAPSHOTS_DIR } from "../data/paths.js";
import { loadSourceRegistry, validateSnapshotInventory } from "./registry.js";
import { runSourceFetch } from "./run.js";

function reportArgument(args: string[]): string {
  const index = args.indexOf("--report");
  if (index === -1) return path.join(SOURCE_FETCH_DIR, "report.json");
  const value = args[index + 1];
  if (!value) throw new Error("--report needs a path");
  return path.resolve(value);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run sources:fetch -- [--report <path>]");
    return;
  }
  const { registry, issues } = await loadSourceRegistry();
  if (!registry || issues.length > 0)
    throw new Error(issues.map((issue) => issue.message).join("; "));
  const inventory = await validateSnapshotInventory(registry);
  if (inventory.length > 0) throw new Error(inventory.map((issue) => issue.message).join("; "));

  const report = await runSourceFetch(registry, {
    snapshotsDir: SNAPSHOTS_DIR,
    reportFile: reportArgument(process.argv.slice(2)),
  });
  const changed = report.results.filter((result) => result.status === "changed").length;
  const errors = report.results.filter((result) => result.status === "error").length;
  console.log(`Source fetch complete: ${changed} changed, ${errors} failed.`);
  if (errors > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Source fetch failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
