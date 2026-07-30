import path from "node:path";
import chokidar from "chokidar";
import { loadAllModels } from "../data/load.js";
import { CLIENT_DIR, MODELS_DIR, VIEWS_DIR } from "../data/paths.js";
import { bundleClientScript, compileStyles, copyStaticAssets } from "../build/assets.js";
import { type Model } from "../schema/model.js";
import { makeApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

let cache: Model[] | null = null;

async function refresh(): Promise<Model[]> {
  const { models, issues } = await loadAllModels();
  if (issues.length > 0) {
    console.warn(`[dev] ${issues.length} validation issue(s):`);
    for (const issue of issues) console.warn(`  ${issue.file}: ${issue.message}`);
  }
  cache = models;
  return models;
}

// Ignore dotfiles by basename only: testing the full absolute path would match a
// dot-segment in an ancestor directory (e.g. a checkout under ~/.paseo/…) and
// silently disable the entire watch.
const ignoreDotfiles = (target: string): boolean => path.basename(target).startsWith(".");

// Poll by default so the watch is reliable on container, overlay and network
// mounts where native FS events don't propagate; set CHOKIDAR_USEPOLLING=false to
// use native events on a normal local disk.
const WATCH_OPTIONS = {
  ignoreInitial: true,
  ignored: ignoreDotfiles,
  usePolling: process.env.CHOKIDAR_USEPOLLING !== "false",
  interval: 300,
  binaryInterval: 600,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
};

async function rebuildClientAssets(): Promise<void> {
  await Promise.all([bundleClientScript(false), compileStyles(), copyStaticAssets()]);
}

function watch(): void {
  chokidar.watch(MODELS_DIR, WATCH_OPTIONS).on("all", async (event, file) => {
    console.log(`[dev] ${event} ${path.relative(process.cwd(), file)} — refreshing`);
    await refresh();
  });

  // Views need a Tailwind recompile, not just a re-render: tailwind.config.ts
  // scans the .ejs files, so a utility class used for the first time in a view
  // is absent from the stylesheet until the CSS is rebuilt. Without this, a new
  // class silently does nothing in dev and works in production.
  chokidar.watch(VIEWS_DIR, WATCH_OPTIONS).on("all", async (event, file) => {
    console.log(`[dev] ${event} ${path.relative(process.cwd(), file)} — recompiling styles`);
    await compileStyles();
  });

  chokidar.watch(CLIENT_DIR, WATCH_OPTIONS).on("all", async () => {
    console.log("[dev] client changed — rebundling");
    await rebuildClientAssets();
  });
}

async function main(): Promise<void> {
  console.log("[dev] bundling client assets...");
  await rebuildClientAssets();
  await refresh();
  watch();
  makeApp(async () => cache ?? (await refresh())).listen(PORT, () => {
    console.log(`[dev] modeldeprecations.dev → http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Dev server failed to start:", err);
  process.exit(1);
});
