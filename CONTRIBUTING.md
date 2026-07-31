# Contributing

The whole value of this site is that its dates are right and its sources are
real. Everything below follows from that.

## The one rule

**Never invent a date.** Every `deprecated_on`, `shutdown_on` and
`earliest_shutdown_on` must be stated at a URL you list in `sources`. If you
cannot find the date, leave the field out. A page that says "deprecated, no
shutdown date published" is useful; a page with a plausible wrong date is worse
than nothing, because someone will plan a migration around it.

CI enforces this: any entry with a lifecycle date and no source fails validation.

### Where to look

- OpenAI — https://developers.openai.com/api/docs/deprecations
- Anthropic — https://platform.claude.com/docs/en/about-claude/model-deprecations
- Google — https://ai.google.dev/gemini-api/docs/deprecations

Providers delete rows from these tables once a model is long gone. If a page has
moved, cite an archive.org snapshot rather than a blog post about it.

## Committed dates vs estimates

This distinction matters more than any other on the site.

- `shutdown_on` — the provider committed to this date. OpenAI's "Shutdown date"
  column, Anthropic's retirement dates for deprecated models.
- `earliest_shutdown_on` — the provider published this as the _earliest_ date a
  model could be retired, explicitly not a commitment. Anthropic's "not sooner
  than" column for active models, Google's shutdown column (their docs say the
  dates "indicate the earliest possible dates on which a model might be
  retired").

Only one of the two may be set. Getting this wrong means either telling people a
model is dying when it is not, or promising a deadline the provider never gave.

A model with only a future `earliest_shutdown_on` stays `active` — it renders as
"shutdown scheduled", not "deprecated".

## Writing a description

Two to four sentences. What the model was, what it was known for, and why it went
away. It should read like someone who used it wrote it.

Do not write "GPT-4 32k is a model from OpenAI that has been deprecated." The
facts table already says that. Write the thing a reader could not have derived
from the table — that access was waitlisted, that it cost double the 8k model,
that GPT-4o made it pointless.

A test asserts every description is unique and at least 120 characters. That is a
floor, not a target.

## Naming a model

`name` is what the h1, the page title and the social card all render, so keep it
to the spelling the provider uses in its own docs — that is what people search
for.

Stick to plain characters. Social cards are rasterized with a vendored Outfit
subset and no system-font fallback, so a curly quote, an en dash or a CJK
character in a `name` renders as an empty box on the shared image. A test parses
the font's cmap and fails the build if a card would draw a character the font
does not have, but it is easier to avoid than to debug.

## Aliases

Dated snapshots fold into the canonical page. `gpt-4-32k-0613` is an alias of
`gpt-4-32k`, not its own entry, because they share a lifecycle and splitting them
would split the page that answers the question.

Every alias gets a URL that redirects to the canonical page, so the id in
someone's code still resolves. Removing an alias is a breaking change and the
data guard rejects it.

## Replacements

`recommended: true` means _the provider named this successor_, not that we think
it is the best option. At most one per model.

Every replacement must point at a page that exists, or be marked
`external: true`. A migration chain that ends on another dead model is worse than
no advice — a test walks every chain to make sure each one terminates on
something still active.

Put parameter differences in `note`. "Swap `max_tokens` for
`max_completion_tokens`" saves a reader an afternoon.

## Editing an existing date

Move `last_verified` forward. That is you asserting you re-read the source, and
the data guard requires it for any date change.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run validate   # schema + cross-file checks
npm test
npm run build
```

`npm run dev` watches `models/` and `src/views/`, so a YAML edit shows up on
refresh.

`npm run check:deploy [origin]` crawls a deployed site rather than the repo, and
checks the things only the edge can get wrong: that an unknown URL really 404s,
that `/api`, the badges and the `.md` twins send `noindex`, that `.html` and
trailing slashes redirect to one canonical address. It runs daily in CI, not on
pull requests, because a failure there is a deployment problem rather than a
problem with the branch.

## Pages

Model and provider pages come from the catalog directly. The cross-provider hubs
— `/deprecated`, `/retired` and `/shutdowns/<year>` — are slices of the same data
in `src/data/hubs.ts`, rendered by `src/build/render-hub.ts`.

Year hubs are derived from the dates present, so a hub can never exist with
nothing on it and the next year appears the day a date lands in it. Anything
added at the site root has to go in `RESERVED_ROOT_SEGMENTS`, or a provider
directory of the same name would shadow it — the build fails if one does.

## Code

- Files under 300 lines, functions under 50.
- `npm run lint`, `npm run typecheck` and `npm test` must pass.
- Anything that shapes what a page claims — status derivation, the answer
  paragraph, date arithmetic — is a pure function with a test. Keep it that way.
