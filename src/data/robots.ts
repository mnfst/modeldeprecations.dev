// robots.txt builder. A pure function of the site origin so the crawl policy is
// unit-testable instead of buried in the build script.

/**
 * The JSON API under /api/v1 and the badge endpoints stay crawlable on purpose:
 * they are served with `X-Robots-Tag: noindex` (see vercel.json), and a
 * `Disallow` here would hide that header from crawlers — Google would keep the
 * already-discovered URLs in the index as bare links instead of dropping them.
 */
export function buildRobotsTxt(siteUrl: string): string {
  return [
    `# AI agents welcome. Machine-readable overview: ${siteUrl}/llms.txt`,
    "User-agent: *",
    "Allow: /",
    "",
    "# /api/v1/*.json and /badge/*.json are crawlable on purpose so crawlers can",
    "# read their noindex header. Do not Disallow them — that strands the URLs.",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}
