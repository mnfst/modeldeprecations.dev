// Site-wide constants shared by the renderers, the structured-data builders and
// the build pipeline. Defined once so the brand name and origin never drift.

export const SITE_NAME = "modeldeprecations.dev";

export const SITE_URL = process.env.SITE_URL ?? "https://modeldeprecations.dev";

export const SITE_DESCRIPTION =
  "An open, sourced catalog of AI model deprecations. For every model: is it deprecated, when does it shut down, and what replaces it — with a link to the provider doc that says so.";

export const REPO_URL = "https://github.com/mnfst/modeldeprecations.dev";

/** The sibling site. Every replacement links across to its parameter page. */
export const SIBLING_URL = "https://modelparams.dev";

/** Path to the site-wide social-share image, relative to the site root. */
export const OG_IMAGE_PATH = "/assets/og.png";

/**
 * Vercel Web Analytics is served from /_vercel/insights, which only exists on
 * Vercel — so the tag is emitted when the build runs there and nowhere else.
 * Deriving it from the environment rather than threading a flag through seven
 * renderers is what keeps it on *every* page: it used to be passed by hand, and
 * only the homepage ever got it, which left the entire long tail unmeasured.
 *
 * Read at call time, like `buildDate`, so a test can pin it.
 */
export function analyticsEnabled(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * The build's "today". Every countdown, derived status and freshness date is
 * computed from this one value so a single build is internally consistent, and
 * so tests can pin it.
 */
export function buildDate(): string {
  return (process.env.BUILD_DATE ?? new Date().toISOString()).slice(0, 10);
}
