# modeldeprecations.dev — build summary

Built 2026-07-30. Static site, npm package deliberately out of scope for this pass.

```
npm run validate   OK — 114 models, 114 carry at least one source
npm test           175 passed (11 files)
npm run typecheck  clean
npm run lint       clean
npm run build      114 models (31 aliases) → 153 pages in ~2s
```

## Pages per provider

| Provider  |  Models | Active | Deprecated | Retired | Aliases | Entries with dates |
| --------- | ------: | -----: | ---------: | ------: | ------: | -----------------: |
| OpenAI    |      71 |     18 |         22 |      31 |      21 |                 53 |
| Anthropic |      23 |     10 |          1 |      12 |       7 |                 23 |
| Google    |      20 |      9 |          0 |      11 |       3 |                 15 |
| **Total** | **114** | **37** |     **23** |  **54** |  **31** |             **91** |

153 URLs: 114 model pages + 31 alias redirects + 3 provider hubs + `/`, `/calendar`,
`/changelog`, `/api`, `/404`. Plus per-model `.md`, JSON and badge endpoints, 121 OG
cards, `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `calendar.ics`,
`changelog.xml`.

14 models carry a _soft_ shutdown date (see below). 80 of 114 have a sourced
`released_on`. The derived changelog has 157 dated events.

## Sources

Every date on the site comes from one of three provider pages, all read on
2026-07-30:

- OpenAI — https://developers.openai.com/api/docs/deprecations
  (`platform.openai.com/docs/deprecations` now 301s here)
- Anthropic — https://platform.claude.com/docs/en/about-claude/model-deprecations
  (`docs.anthropic.com` and `docs.claude.com` both redirect here)
- Google — https://ai.google.dev/gemini-api/docs/deprecations

No date was taken from the `techdevsynergy/llm-model-deprecation` seed registry.
It was used to scope the work, then every entry was re-read against the provider
docs — and the live docs turned out to be substantially ahead of it (the seed has
no GPT-5-family, Codex, or 2026 Anthropic deprecations at all).

## Committed dates vs provider estimates

The most important modelling decision here, and the one that most affects whether
the site can be trusted.

Anthropic publishes a "not sooner than" retirement date for models that are
**active and fully supported**. Google's deprecations page says outright that its
shutdown dates "indicate the earliest possible dates on which a model might be
retired". Treating either as a deprecation would mark Claude Opus 5 and Gemini 2.5
Pro as deprecated, which is false.

So the schema splits them:

- `shutdown_on` — a committed date (OpenAI's Shutdown column, Anthropic's
  retirement dates for models it has actually deprecated).
- `earliest_shutdown_on` — a published estimate. Renders as "Shutdown scheduled"
  with an explicit "earliest" qualifier, and keeps `status: active`.

Once a soft date is in the past the model is reported as retired, because that is
what the date meant. This is why Google shows 0 deprecated but 11 retired.

## Dates I could NOT verify

**Gemini 1.5 Pro / 1.5 Flash (and their `-002` snapshots) — omitted entirely.**

- The seed registry claims a 2026-06-17 sunset.
- Google's live deprecations page no longer lists any 1.5 model — Google removes
  rows once a model is gone.
- Not on `docs.cloud.google.com/vertex-ai/generative-ai/docs/deprecations` either
  (that page now carries a single entry and says Vertex docs are frozen).
- `web.archive.org` is not reachable from this environment, so I could not pull a
  pre-removal snapshot.

I could have shipped `status: retired` with no date, but claiming a model is
retired is itself a claim, and I have no primary source for it. Per the project's
own rule, these are left out rather than guessed. **This is the highest-value gap
to close** — "is gemini-1.5-pro deprecated" is a real query volume. One archive.org
snapshot of the Gemini deprecations page from before mid-2026 resolves it.

**`gpt-4-1106-preview` has two conflicting shutdown dates in OpenAI's own docs.**
It appears in the 2025-09-26 announcement with a 2026-03-26 shutdown, and again in
the 2026-04-22 announcement with 2026-10-23. I shipped the later date and called
the discrepancy out in the page's description rather than silently picking one.

**A Google forum thread reports `gemini-2.5-flash` and `gemini-2.5-flash-lite`
returning 404 "no longer available" on 2026-07-09**, months before the published
2026-10-16 date. The site ships Google's published date, since a forum post is not
a primary source — but if that report is accurate, three Gemini 2.5 pages are
optimistic. Worth re-checking against the API directly.

**`released_on` is unset for 34 of 114 models**, mostly older OpenAI ids. The dated
snapshot ids encode their release date (`gpt-4-0613`), but inferring a field from
an id is not the same as sourcing it, so those are left blank and the facts table
shows an em dash.

## Scope notes

- **Chat/text models only.** OpenAI's image, audio, realtime, video (Sora),
  embedding and moderation deprecations are excluded, as are Google's Imagen, Veo,
  Lyria, robotics, Live and embedding models. Roughly 60 more pages are available
  here whenever the scope widens.
- **Omitted from the OpenAI legacy tail:** `text-davinci-001`, `text-curie-001`,
  `text-babbage-001`, and the `-vision-preview` fine-tuning variants. The
  higher-traffic members of that family (`text-davinci-003`, `text-davinci-002`,
  `code-davinci-002`, `davinci`, `curie`, `babbage`, `ada`) are all present.
- **Omitted from Anthropic:** `claude-1.0`–`claude-1.3`, `claude-instant-1.0`,
  `claude-instant-1.1`. All retired 2024-11-06 with the same replacement;
  `claude-instant-1.2` represents the line. Also `claude-mythos-preview`, which is
  documented as deprecated but with no dates and invitation-only access.
- **Gemma is excluded.** Open weights do not get shut down, so a deprecation page
  for them would answer a question nobody has.
- **npm package not built**, per instructions.

## What I'd do next, in order

1. Recover the Gemini 1.5 dates from an archive.org snapshot.
2. Verify the Gemini 2.5 shutdown dates against the live API.
3. Add the reciprocal link from modelparams.dev model pages back to here (planned
   as a follow-up PR in that repo).
4. Widen scope to image/audio/realtime models — the data is already collected
   above and it roughly doubles the page count.
5. The `modeldeprecations` npm package.

## Screenshots

`docs/screenshots/`

| File                   | What it shows                                                         |
| ---------------------- | --------------------------------------------------------------------- |
| `model-retired.png`    | `openai/gpt-4-32k` — a retired model, full page                       |
| `model-deprecated.png` | `anthropic/claude-opus-4-1-20250805` — deprecated, 6 days to shutdown |
| `model-active.png`     | `openai/gpt-4o` — an active model answering "No"                      |
| `calendar.png`         | `/calendar` — shutdowns by month with the .ics subscribe button       |
| `home.png`             | `/` — next shutdowns above the fold, then the sortable table          |
| `provider-openai.png`  | `/openai` — the three-table provider hub                              |
| `changelog.png`        | `/changelog` — dated events with RSS                                  |
| `model-mobile.png`     | a model page at 390px                                                 |

## Two bugs found and fixed during the build

- **Dev server never recompiled Tailwind when a view changed.** Only
  `src/client/**` triggered a CSS rebuild, so any utility class used for the first
  time in an `.ejs` silently did nothing in dev and worked in production. Caught
  by measuring horizontal overflow at 390px; fixed in `src/server/dev.ts`.
- **A retired model with no recoverable shutdown date reported as active.** The
  answer builder required a date before taking the retired branch and fell through
  to the "not deprecated" wording. Found while deciding how to handle Gemini 1.5;
  fixed in `src/data/answer.ts` with a regression test.
