// CI entry point for the data guard. Compares the catalog on this branch against
// the base branch and fails the build on any regression (see regressions.ts).
//
// Maintainers override with the `allow-data-regression` label on the PR, which
// skips this step and leaves the reason visible in the checks output.

import { loadAllModels } from "./load.js";
import { loadModelsAtRef, refExists } from "./git-baseline.js";
import { findRegressions } from "./regressions.js";

async function main(): Promise<void> {
  const baseRef = process.env.BASE_REF ?? "origin/main";

  if (!refExists(baseRef)) {
    console.log(`No baseline at ${baseRef} — nothing to compare against. Skipping.`);
    return;
  }

  const [before, current] = await Promise.all([loadModelsAtRef(baseRef), loadAllModels()]);
  if (current.issues.length > 0) {
    console.error("Catalog does not validate; run `npm run validate` first.");
    process.exit(1);
  }

  const regressions = findRegressions(before, current.models);
  if (regressions.length === 0) {
    console.log(`OK — no data regressions against ${baseRef} (${current.models.length} models).`);
    return;
  }

  console.error(`Found ${regressions.length} data regression(s) against ${baseRef}:\n`);
  for (const regression of regressions) {
    console.error(`  • ${regression.id}: ${regression.message}`);
  }
  console.error(
    "\nIf this is intentional, a maintainer can apply the `allow-data-regression` label.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("Data guard crashed:", err);
  process.exit(2);
});
