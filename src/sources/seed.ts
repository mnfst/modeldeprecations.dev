import fs from "node:fs/promises";
import { SNAPSHOTS_DIR } from "../data/paths.js";
import { fetchSource } from "./fetch-source.js";
import { atomicWrite, readOptional } from "./files.js";
import { loadSourceRegistry, snapshotPath, sourceId } from "./registry.js";

async function main(): Promise<void> {
  const selector = process.argv[2];
  if (!selector || process.argv.includes("--help")) {
    console.log("Usage: npm run sources:seed -- <provider>/<slug> | --all-missing");
    return;
  }
  const { registry, issues } = await loadSourceRegistry();
  if (!registry || issues.length > 0)
    throw new Error(issues.map((issue) => issue.message).join("; "));
  const targets =
    selector === "--all-missing"
      ? registry.sources
      : registry.sources.filter((source) => sourceId(source) === selector);
  if (targets.length === 0) throw new Error(`unknown source ${selector}`);

  let created = 0;
  for (const source of targets) {
    const file = snapshotPath(source, SNAPSHOTS_DIR);
    const existing = await readOptional(file);
    if (existing) {
      if (selector !== "--all-missing")
        throw new Error(`snapshot already exists for ${sourceId(source)}`);
      continue;
    }
    const fetched = await fetchSource(source);
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    await atomicWrite(file, fetched.body);
    created += 1;
    console.log(`Seeded ${sourceId(source)} (${fetched.body.byteLength} bytes).`);
  }
  console.log(`Seed complete: ${created} snapshot(s) created.`);
}

main().catch((error) => {
  console.error(`Source seed failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
