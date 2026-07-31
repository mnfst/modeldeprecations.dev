// The pieces every page's JSON-LD graph is assembled from: the envelope, the
// breadcrumb trail, and the two site-level nodes that are the same on every page
// they appear on. Split out from structured-data.ts so the per-page builders
// there stay readable, and so the Organization identity is defined exactly once.

import { REPO_URL, SIBLING_URL, SITE_DESCRIPTION, SITE_NAME } from "../data/site.js";
import { absolute } from "../data/urls.js";

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumb(siteUrl: string, crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(siteUrl, crumb.path),
    })),
  };
}

/** Wraps a set of nodes in the @context/@graph envelope, ready for a <script>. */
export function graph(nodes: unknown[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes });
}

export function organizationNode(siteUrl: string) {
  return {
    "@type": "Organization",
    "@id": `${siteUrl}/#org`,
    name: SITE_NAME,
    url: `${siteUrl}/`,
    description: SITE_DESCRIPTION,
    // The square PNG rather than the SVG favicon: Google's logo extraction wants a
    // raster it can crop, and ignores SVG.
    logo: `${siteUrl}/assets/apple-touch-icon.png`,
    sameAs: [REPO_URL, SIBLING_URL],
  };
}

export function homeWebsiteNode(siteUrl: string) {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: SITE_NAME,
    // Interior titles spend their 60 characters on the model name and the
    // keyword, so the brand is not in them. Google takes the site name it shows
    // above a result from this node on the homepage — which is where the brand
    // earns its place, rather than by crowding out the words people searched for.
    alternateName: "Model Deprecations",
    description: SITE_DESCRIPTION,
    publisher: { "@id": `${siteUrl}/#org` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}
