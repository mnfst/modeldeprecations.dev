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
 * The build's "today". Every countdown, derived status and freshness date is
 * computed from this one value so a single build is internally consistent, and
 * so tests can pin it.
 */
export function buildDate(): string {
  return (process.env.BUILD_DATE ?? new Date().toISOString()).slice(0, 10);
}
