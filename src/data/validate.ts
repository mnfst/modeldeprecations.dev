import { loadAllModels } from "./load.js";
import { loadSourceRegistry, validateSnapshotInventory } from "../sources/registry.js";

async function main(): Promise<void> {
  const [{ models, issues: modelIssues }, sourceResult] = await Promise.all([
    loadAllModels(),
    loadSourceRegistry(),
  ]);
  const sourceIssues = sourceResult.registry
    ? [...sourceResult.issues, ...(await validateSnapshotInventory(sourceResult.registry))]
    : sourceResult.issues;
  const issues = [...modelIssues, ...sourceIssues];

  if (issues.length > 0) {
    console.error(`Found ${issues.length} validation issue(s):\n`);
    for (const issue of issues) {
      console.error(`  • ${issue.file}`);
      console.error(`    ${issue.message}\n`);
    }
    process.exit(1);
  }

  const sourced = models.filter((model) => model.sources.length > 0).length;
  console.log(
    `OK — validated ${models.length} model(s), ${sourceResult.registry!.sources.length} source snapshot(s); ${sourced} models carry at least one source.`,
  );
}

main().catch((err) => {
  console.error("Validation crashed:", err);
  process.exit(2);
});
