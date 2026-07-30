# modeldeprecations.dev — build summary

Built 2026-07-30. Static site, npm package deliberately out of scope for this pass.

```
npm run validate   OK — 156 models, 156 carry at least one source
npm test           177 passed (11 files)
npm run typecheck  clean
npm run lint       clean
npm run build      156 models (44 aliases) → 208 pages in ~3.7s
```

## Pages per provider

| Provider  |  Models | Active | Deprecated | Retired | Aliases | Entries with dates |
| --------- | ------: | -----: | ---------: | ------: | ------: | -----------------: |
| OpenAI    |     103 |     27 |         30 |      46 |      30 |                 76 |
| Anthropic |      29 |     10 |          1 |      18 |       9 |                 29 |
| Google    |      24 |      9 |          0 |      15 |       5 |                 17 |
| **Total** | **156** | **46** |     **31** |  **79** |  **44** |            **122** |

208 URLs: 156 model pages + 44 alias redirects + 3 provider hubs + `/`, `/calendar`,
`/changelog`, `/api`, `/404`. Plus per-model `.md`, JSON and badge endpoints, 163 OG
cards, `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `calendar.ics`,
`changelog.xml`.

14 models carry a _soft_ shutdown date (see below). 93 of 156 have a sourced
`released_on`. The derived changelog has 217 dated events; 45 shutdowns are still
ahead of today.

## Sources

Every date on the site comes from a provider page, all read on 2026-07-30:

- OpenAI — https://developers.openai.com/api/docs/deprecations
  (`platform.openai.com/docs/deprecations` now 301s here)
- Anthropic — https://platform.claude.com/docs/en/about-claude/model-deprecations
  (`docs.anthropic.com` and `docs.claude.com` both redirect here)
- Google — https://ai.google.dev/gemini-api/docs/deprecations

**One exception, clearly marked.** The four Gemini 1.x pages cite the community
[`llm-model-deprecation`](https://github.com/techdevsynergy/llm-model-deprecation)
registry as a second source, because Google has removed those rows from its own
tables. Those pages say so in prose, and the source is titled
"llm-model-deprecation registry (third-party)" so a reader can see the provenance
is weaker. Nothing else on the site depends on it.

### On that registry

It was used first to scope the work, then every row was checked against the live
provider docs — and it turned out to be behind them in several places:

| Row                       | Registry                         | Provider docs                                              |
| ------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `gpt-4o-realtime-preview` | sunset 2026-03-24 → gpt-realtime | dep 2025-09-15, shutdown **2026-05-07** → gpt-realtime-1.5 |
| `gpt-4o-audio-preview`    | sunset 2026-03-24 → gpt-audio    | dep 2025-09-15, shutdown **2026-05-07** → gpt-audio-1.5    |
| `dall-e-2` / `dall-e-3`   | → gpt-image-1                    | → **gpt-image-2** (gpt-image-1 is itself now deprecated)   |
| `text-embedding-ada-002`  | deprecated, sunset 2025-01-01    | **not on the deprecations page at all** — still served     |

Where the two disagree, the provider docs won. The registry also predates the
entire GPT-5 family, the Codex line, the 2026 Anthropic deprecations and the
GPT-5.6 generation, so ~90 of the models here have no registry row at all.

`text-embedding-ada-002` is the one row I declined outright: the registry marks it
deprecated with a January 2025 sunset, OpenAI does not list it anywhere, and it is
still served. It ships as **active**, with the page explaining that it is one of
the most commonly assumed-dead ids on the platform.

All 62 non-active registry rows are now represented — 0 missing.

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
what the date meant. This is why Google shows 0 deprecated but 15 retired.

## Dates I could NOT verify

**Gemini 1.5 Pro / Flash — shipped, but on third-party evidence only.** Google's
live page no longer lists any 1.5 model, the Vertex deprecations page is frozen,
and `web.archive.org` is unreachable from this environment. The 2026-06-17
shutdown date comes from the registry. Both pages state that in their description.
A pre-removal archive.org snapshot of Google's page would upgrade this.

**Gemini 1.0 Pro / Flash — retired with no date.** The registry classifies them as
`legacy` with no sunset date, and Google publishes nothing. They ship as `retired`
with the shutdown field empty, which renders as "retired and no longer served by
Google, which has not published the exact shutdown date". This is the case that
exposed the answer-builder bug listed at the bottom.

**`gpt-4-1106-preview` has two conflicting shutdown dates in OpenAI's own docs.**
It appears in the 2025-09-26 announcement with a 2026-03-26 shutdown, and again in
the 2026-04-22 announcement with 2026-10-23. I shipped the later date and called
the discrepancy out in the page's description rather than silently picking one.

**A Google forum thread reports `gemini-2.5-flash` and `gemini-2.5-flash-lite`
returning 404 "no longer available" on 2026-07-09**, months before the published
2026-10-16 date. The site ships Google's published date, since a forum post is not
a primary source — but if that report is accurate, three Gemini 2.5 pages are
optimistic. Worth re-checking against the API directly.

**`released_on` is unset for 63 of 156 models**, mostly older OpenAI ids. The dated
snapshot ids encode their release date (`gpt-4-0613`), but inferring a field from
an id is not the same as sourcing it, so those are left blank and the facts table
shows an em dash.

## Scope

Originally chat/text only; the registry pass widened it to every model class
OpenAI has deprecated:

- **Image** — DALL·E 2 and 3, gpt-image-1, -mini and 1.5, chatgpt-image-latest,
  plus gpt-image-2 as the live target.
- **Realtime and audio** — the gpt-4o realtime/audio previews and their dated
  snapshots, gpt-realtime, gpt-realtime-mini, gpt-audio, gpt-audio-mini and the
  October 2025 pins, plus gpt-realtime-1.5/2.1/2.1-mini and gpt-audio-1.5.
- **Moderation** — text-moderation-007 with `-stable` and `-latest` folded in as
  aliases, plus omni-moderation.
- **Embeddings** — ada-002, 3-small and 3-large, all active.
- **The full InstructGPT tail** — text-davinci-001/002/003, text-curie-001,
  text-babbage-001, text-ada-001, ada, babbage, curie, davinci, code-davinci-002.
- **Anthropic Claude 1** — claude-1.0 through 1.3 and Instant 1.0/1.1/1.2, all
  deprecated 2024-09-04 and retired 2024-11-06 per Anthropic's own history table.

Completions-endpoint twins (`gpt-4-completions`, `gpt-3.5-turbo-completions`,
`gpt-4-turbo-preview-completions`, …) are folded in as aliases rather than given
their own pages — same model, different endpoint.

Still out of scope: Sora/video, Google's Imagen, Veo, Lyria, TTS and Live models,
and Gemma (open weights do not get shut down). `claude-mythos-preview` is
documented as deprecated but carries no dates and is invitation-only.

**npm package not built**, per instructions.

## What I'd do next, in order

1. An archive.org snapshot of Google's deprecations page to replace the
   third-party citation on the four Gemini 1.x pages.
2. Verify the Gemini 2.5 shutdown dates against the live API.
3. Add the reciprocal link from modelparams.dev model pages back to here (planned
   as a follow-up PR in that repo).
4. Google's Imagen/Veo/Lyria/TTS/Live deprecations, the last significant gap.
5. The `modeldeprecations` npm package.

## Screenshots

`docs/screenshots/`

| File                   | What it shows                                                         |
| ---------------------- | --------------------------------------------------------------------- |
| `model-retired.png`    | `openai/gpt-4-32k` — a retired model, full page                       |
| `model-deprecated.png` | `anthropic/claude-opus-4-1-20250805` — deprecated, 6 days to shutdown |
| `model-active.png`     | `openai/gpt-4o` — an active model answering "No"                      |
| `calendar.png`         | `/calendar` — 45 shutdowns by month with the .ics subscribe button    |
| `home.png`             | `/` — next shutdowns above the fold, then the filterable table        |
| `provider-openai.png`  | `/openai` — the four-table provider hub                               |
| `changelog.png`        | `/changelog` — dated events with RSS                                  |
| `model-mobile.png`     | a model page at 390px                                                 |

## Five bugs found and fixed during the build

- **Dev server never recompiled Tailwind when a view changed.** Only
  `src/client/**` triggered a CSS rebuild, so any utility class used for the first
  time in an `.ejs` silently did nothing in dev and worked in production. Caught
  by measuring horizontal overflow at 390px; fixed in `src/server/dev.ts`.
- **A retired model with no recoverable shutdown date reported as active.** The
  answer builder required a date before taking the retired branch and fell through
  to the "not deprecated" wording. Found while deciding how to handle Gemini 1.5,
  and it is exactly what the Gemini 1.0 pages needed; fixed in `src/data/answer.ts`
  with a regression test.
- **`/sitemap.xml` 404'd in dev** — it was written by the static build only. The
  builder now lives in `src/data/sitemap.ts` and both surfaces share it, with a
  test asserting the sitemap lists every model page and nothing marked noindex.
- **Social cards contradicted their own status pill.** `modelCard` branched on the
  shutdown date before the status, so a retired model with no recoverable date
  fell through to the active wording — the Gemini 1.0 cards shipped a red
  **RETIRED** pill directly above the words "Not deprecated". Same root cause as
  the answer-builder bug, in a second renderer.
- **Every card with a successor drew a tofu box.** The chip read `→ gpt-4o`, but
  cards are rasterized with the vendored Outfit subset and
  `loadSystemFonts: false` — 223 glyphs, no U+2192 and no fallback. The chip is
  now worded (`Use gpt-4o`), and a test parses the font's cmap and asserts every
  character on every card is one the font can actually draw.
