// Post-deploy crawl checks: the things that can only be wrong in production.
//
// The build and the dev server agree — tests/server.test.ts asserts a real 404
// on an unknown path, and it passes. Production disagreed anyway: every unknown
// URL returned 200 with the homepage, which made the 404 page dead code, turned
// every typo into a soft 404, and served HTML from the .md and .json surfaces.
// Nothing in the repo can catch that, because nothing in the repo is wrong. So
// this runs against the deployed origin instead.
//
//   node scripts/check-deployment.mjs [origin]

const ORIGIN = (process.argv[2] ?? "https://modeldeprecations.dev").replace(/\/$/, "");

// The refresh workflow rebuilds daily; two days allows for one missed run and
// for this check racing ahead of the rebuild, without tolerating real drift.
const MAX_BUILD_AGE_DAYS = 2;

const failures = [];
const passes = [];

function record(ok, label, detail) {
  if (ok) passes.push(label);
  else failures.push(`${label}\n      ${detail}`);
}

async function head(pathname) {
  const res = await fetch(`${ORIGIN}${pathname}`, { redirect: "manual" });
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    robots: res.headers.get("x-robots-tag") ?? "",
    location: res.headers.get("location") ?? "",
    body: await res.text(),
  };
}

async function expectStatus(pathname, want, why) {
  const res = await head(pathname);
  record(res.status === want, `${pathname} → ${want}`, `got ${res.status}. ${why}`);
  return res;
}

async function main() {
  console.log(`Checking ${ORIGIN}\n`);

  // A real page still works. If this fails, nothing below means anything.
  await expectStatus("/", 200, "The homepage should serve.");
  await expectStatus("/openai/gpt-4-32k", 200, "A known model page should serve.");

  // The soft-404 check. A path nobody has ever deployed must not resolve.
  const home = await head("/");
  for (const pathname of ["/zzz-not-a-real-path", "/openai/zzz-not-a-real-model", "/a/b/c"]) {
    const res = await head(pathname);
    record(
      res.status === 404,
      `${pathname} → 404`,
      `got ${res.status}. Unknown URLs must not resolve; a catch-all rewrite to / turns every ` +
        `typo into a soft 404 and hides dist/404.html.`,
    );
    record(
      res.body !== home.body,
      `${pathname} does not serve the homepage`,
      `the response body is byte-identical to /, which is the signature of an SPA-style ` +
        `catch-all rewrite. Remove it in the Vercel project settings.`,
    );
  }

  // Non-HTML surfaces must not fall back to HTML either.
  const missingMd = await head("/openai/zzz-not-a-real-model.md");
  record(
    missingMd.status === 404,
    "/openai/zzz-not-a-real-model.md → 404",
    `got ${missingMd.status} as ${missingMd.type}. Agents reading .md must not be handed HTML.`,
  );
  const missingJson = await head("/api/v1/models/openai/zzz-not-real.json");
  record(
    missingJson.status === 404,
    "/api/v1/models/openai/zzz-not-real.json → 404",
    `got ${missingJson.status} as ${missingJson.type}. API consumers must not be handed HTML.`,
  );

  // Indexation rules. Everything under /api is noindex; so are the badges and
  // the .md twins, which would otherwise duplicate every model page.
  for (const pathname of ["/api", "/api/v1/models.json", "/badge/openai/gpt-4-32k.json"]) {
    const res = await head(pathname);
    record(
      res.robots.includes("noindex"),
      `${pathname} sends X-Robots-Tag: noindex`,
      `got "${res.robots || "(none)"}".`,
    );
  }
  const md = await head("/openai/gpt-4-32k.md");
  record(
    md.robots.includes("noindex"),
    "/openai/gpt-4-32k.md sends X-Robots-Tag: noindex",
    `got "${md.robots || "(none)"}". The .md twin duplicates the HTML page verbatim.`,
  );
  record(
    md.type.includes("text/markdown"),
    "/openai/gpt-4-32k.md is served as markdown",
    `got "${md.type}".`,
  );

  // The canonical URL shape: one address per page, everything else redirects.
  for (const [pathname, want] of [
    ["/openai/gpt-4-32k.html", "/openai/gpt-4-32k"],
    ["/openai/gpt-4-32k/", "/openai/gpt-4-32k"],
    ["/index.html", "/"],
  ]) {
    const res = await head(pathname);
    const to = res.location.replace(ORIGIN, "");
    record(
      res.status >= 300 && res.status < 400 && to === want,
      `${pathname} redirects to ${want}`,
      `got ${res.status} → ${to || "(nowhere)"}.`,
    );
  }

  // The crawl entry points.
  const robots = await expectStatus("/robots.txt", 200, "Crawlers start here.");
  record(
    robots.body.includes(`${ORIGIN}/sitemap.xml`),
    "robots.txt points at the sitemap",
    "no absolute Sitemap: line found.",
  );
  const sitemap = await expectStatus("/sitemap.xml", 200, "Discovery depends on it.");
  record(
    !/<loc>[^<]*\/api/.test(sitemap.body),
    "sitemap lists nothing under /api",
    "a noindex URL in the sitemap asks a crawler to fetch a page we told it to forget.",
  );
  for (const pathname of ["/deprecated", "/retired", "/about"]) {
    record(
      sitemap.body.includes(`<loc>${ORIGIN}${pathname}</loc>`),
      `sitemap lists ${pathname}`,
      "the hub is live but undiscoverable.",
    );
    await expectStatus(pathname, 200, "Listed in the sitemap, so it has to serve.");
  }

  // Build freshness. The site answers "is it deprecated yet" as of the day it
  // was generated, so a build that stops being refreshed does not break — it
  // just quietly starts lying, counting down to dates that have already passed.
  // Nothing in the repo can detect that either, because the repo is fine; only
  // the deployed artifact is old. .github/workflows/refresh.yml keeps it moving
  // and this is what notices when it stops.
  const catalog = await head("/api/v1/models.json");
  let asOf = "";
  try {
    asOf = JSON.parse(catalog.body).asOf ?? "";
  } catch {
    asOf = "";
  }
  const age = asOf ? Math.round((Date.now() - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000) : NaN;
  record(
    Number.isFinite(age) && age <= MAX_BUILD_AGE_DAYS,
    `the deployed build is at most ${MAX_BUILD_AGE_DAYS} days old`,
    `asOf is ${asOf || "(unreadable)"}, ${Number.isFinite(age) ? `${age} days old` : "unparseable"}. ` +
      `Every countdown on the site is computed against that date, so they are all off by ` +
      `the same amount. Check the Daily refresh workflow and VERCEL_DEPLOY_HOOK_URL.`,
  );

  console.log(`${passes.length} passed`);
  for (const pass of passes) console.log(`  ok    ${pass}`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} failed`);
    for (const failure of failures) console.log(`  FAIL  ${failure}`);
    process.exit(1);
  }
  console.log("\nAll deployment checks passed.");
}

main().catch((err) => {
  console.error("Check run failed:", err);
  process.exit(1);
});
