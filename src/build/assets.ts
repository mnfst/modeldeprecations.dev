import fs from "node:fs/promises";
import path from "node:path";
import { build as esbuild } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { CLIENT_DIR, DIST_ASSETS_DIR, REPO_ROOT } from "../data/paths.js";

export async function bundleClientScript(minify = true): Promise<void> {
  await esbuild({
    entryPoints: [path.join(CLIENT_DIR, "main.ts")],
    outfile: path.join(DIST_ASSETS_DIR, "main.js"),
    bundle: true,
    minify,
    format: "esm",
    target: ["es2022"],
    sourcemap: !minify,
    logLevel: "warning",
  });
}

export async function compileStyles(): Promise<void> {
  const input = await fs.readFile(path.join(CLIENT_DIR, "styles.css"), "utf8");
  const result = await postcss([
    tailwindcss({ config: path.join(REPO_ROOT, "tailwind.config.ts") }),
    autoprefixer(),
  ]).process(input, { from: path.join(CLIENT_DIR, "styles.css"), to: "styles.css" });
  await fs.writeFile(path.join(DIST_ASSETS_DIR, "styles.css"), result.css, "utf8");
}

async function copyDir(from: string, to: string, filter: (name: string) => boolean): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from).catch(() => []);
  await Promise.all(
    entries
      .filter(filter)
      .map((name) => fs.copyFile(path.join(from, name), path.join(to, name))),
  );
}

export async function copyStaticAssets(): Promise<void> {
  await fs.mkdir(DIST_ASSETS_DIR, { recursive: true });
  // og.png is generated, not copied — the build writes a card per page.
  await Promise.all(
    ["favicon.svg", "apple-touch-icon.png"].map((name) =>
      fs.copyFile(path.join(CLIENT_DIR, name), path.join(DIST_ASSETS_DIR, name)),
    ),
  );

  // Fonts are served from our own origin: no third-party request on any page,
  // and no layout shift waiting on fonts.googleapis.com.
  await copyDir(
    path.join(CLIENT_DIR, "fonts"),
    path.join(DIST_ASSETS_DIR, "fonts"),
    (name) => name.endsWith(".woff2") || name.endsWith(".txt"),
  );

  await copyDir(
    path.join(CLIENT_DIR, "logos"),
    path.join(DIST_ASSETS_DIR, "logos"),
    (name) => name.endsWith(".svg") && !name.startsWith("_"),
  );
}
