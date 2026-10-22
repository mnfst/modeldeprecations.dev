// modeldeprecations.dev's Worker: every page redirects for good to the
// okapi.bot page answering the same question (src/redirects/okapi.ts); the
// JSON API, the badges, the images, robots.txt and the sitemap are still
// served from the static files.
import map from "../redirects/okapi-map.json";
import { redirectTarget, servedAsIs } from "../redirects/okapi.js";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (servedAsIs(pathname)) return env.ASSETS.fetch(request);
    return new Response(null, {
      status: 301,
      headers: {
        location: redirectTarget(pathname, map),
        "cache-control": "public, max-age=86400",
      },
    });
  },
};
