import path from "node:path";
import ejs from "ejs";
import { VIEWS_DIR } from "../data/paths.js";
import { SITE_NAME, SITE_URL } from "../data/site.js";
import { CALENDAR_PATH } from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

export async function renderNotFoundPage(models: Model[], today: string): Promise<string> {
  const body = await ejs.renderFile(path.join(VIEWS_DIR, "not-found.ejs"), {
    calendarPath: CALENDAR_PATH,
    helpers: viewHelpers,
  });

  return renderShell(
    {
      title: `Page not found · ${SITE_NAME}`,
      description: "That model has no page here yet. Browse the catalog or open an issue to add it.",
      canonicalUrl: `${SITE_URL}/404`,
      robots: "noindex, follow",
      structuredData: JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage" }),
      providerHubs: hubLinks(models, today),
    },
    body,
  );
}
