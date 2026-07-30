import { loadAllModels } from "./load.js";

async function main(): Promise<void> {
  const { models, issues } = await loadAllModels();

  if (issues.length > 0) {
    console.error(`Found ${issues.length} validation issue(s):\n`);
    for (const issue of issues) {
      console.error(`  • ${issue.file}`);
      console.error(`    ${issue.message}\n`);
    }
    process.exit(1);
  }

  const sourced = models.filter((model) => model.sources.length > 0).length;
  console.log(`OK — validated ${models.length} model(s); ${sourced} carry at least one source.`);
}

main().catch((err) => {
  console.error("Validation crashed:", err);
  process.exit(2);
});
