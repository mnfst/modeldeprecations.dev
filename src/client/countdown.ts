// Keeps the countdowns honest on a page that outlived its build.
//
// The site is static, so "in 2 days" is written into the HTML at build time and
// then stays there — through CDN caching, through a browser's back/forward
// cache, and through any gap between rebuilds. Left alone it drifts: claude-
// opus-4-1 shut down on 2026-08-05, and a page generated on the 3rd went on
// announcing "in 2 days" after the model was already gone.
//
// Each countdown carries the date it counts to, so the fix is to recompute the
// phrase from the reader's own clock. This is the same relativeDays() the build
// calls, so a fresh page is rewritten to the identical string and nothing moves.

import { daysBetween, localToday, relativeDays } from "../data/relative-time.js";

export function setupCountdowns(): void {
  const today = localToday(new Date());
  document.querySelectorAll<HTMLTimeElement>("time[data-countdown]").forEach((el) => {
    const target = el.getAttribute("datetime");
    if (!target) return;
    const text = relativeDays(daysBetween(today, target));
    if (el.textContent !== text) el.textContent = text;
  });
}
