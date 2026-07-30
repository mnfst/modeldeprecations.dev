# modeldeprecations.dev

**Is this model deprecated? When does it shut down? What replaces it?**

One page per AI model, answering those three questions with a date and a link to
the provider documentation that states it. Sibling of
[modelparams.dev](https://modelparams.dev), which catalogues the parameters each
model accepts.

- **Site** — https://modeldeprecations.dev
- **JSON API** — https://modeldeprecations.dev/api/v1/models.json
- **Calendar** — https://modeldeprecations.dev/calendar.ics
- **Changelog RSS** — https://modeldeprecations.dev/changelog.xml

## Lifecycle states

The three states match the vocabulary the providers themselves publish:

| Status       | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| `active`     | Still supported. No deprecation announced.                     |
| `deprecated` | The provider has announced it is going away. It still answers. |
| `retired`    | API access is gone. Requests fail.                             |

A model can be **active and carry a shutdown date**. Anthropic publishes a "not
sooner than" date and Google publishes an earliest shutdown date for models that
are current and fully supported. Those go in `earliest_shutdown_on` and are shown
as _scheduled shutdowns_, not deprecations — because that is what the provider
actually committed to. A firm date goes in `shutdown_on`.

The status a page renders is recomputed against the build date, so a model flips
to `retired` on the day its shutdown lands without anyone editing a file.

## API

```bash
# One model
curl https://modeldeprecations.dev/api/v1/models/openai/gpt-4-32k.json

# The same page as Markdown — the answer, the dates, the sources
curl https://modeldeprecations.dev/openai/gpt-4-32k.md

# Everything
curl https://modeldeprecations.dev/api/v1/models.json
```

Static JSON from the edge, CORS-enabled, no key and no rate limit. Ids are
`provider/model`; dated snapshots such as `gpt-4-32k-0613` are listed as
`aliases` of their canonical entry rather than duplicated as separate records.

### README badges

A [shields.io](https://shields.io) endpoint per model. Green while it works,
amber once deprecated, red once it is gone — and it changes on its own.

```markdown
![](https://img.shields.io/endpoint?url=https://modeldeprecations.dev/badge/openai/gpt-4-32k.json)
```

### For agents

- `llms.txt` and `llms-full.txt` at the site root
- Every model page also served as Markdown (append `.md`)
- In-browser [WebMCP](https://github.com/webmachinelearning/webmcp) tools:
  `check_model_deprecation`, `list_shutdowns`, `find_replacement`,
  `get_usage_guide`

## Data

One YAML file per model under `models/{provider}/{model}.yaml`:

```yaml
# yaml-language-server: $schema=https://modeldeprecations.dev/api/v1/schema.json
provider: openai
model: gpt-4-32k
name: GPT-4 32k
aliases: [gpt-4-32k-0613, gpt-4-32k-0314]
description: >-
  Two to four sentences on what it was, what it was known for, and why it went
  away. Never templated.
released_on: 2023-06-13
deprecated_on: 2024-06-06 # the provider announced it
shutdown_on: 2025-06-06 # API access removed
status: retired
replacements:
  - provider: openai
    model: gpt-4o
    recommended: true # the successor the provider itself names
    note: Migration hint, including any parameter differences.
sources:
  - url: https://developers.openai.com/api/docs/deprecations
    title: OpenAI API deprecations
    accessed: 2026-07-30
last_verified: 2026-07-30
```

### The rule

**Never invent a date.** Every `deprecated_on`, `shutdown_on` and
`earliest_shutdown_on` must be verifiable at a URL in `sources`. If a date cannot
be sourced, omit the field — the page will say so honestly rather than guess. CI
rejects a date without a citation.

## Contributing

```bash
npm install
npm run dev        # http://localhost:3000, watches models/ and views/
npm run validate   # schema + cross-file checks
npm test
npm run build      # static site into dist/
```

Two CI workflows run on every PR:

- **CI** — lint, typecheck, validate, test, build.
- **Data guard** — rejects removing a page, removing an alias that used to
  resolve, stripping sources out from under a date, or editing a date without
  moving `last_verified` forward. A maintainer can override with the
  `allow-data-regression` label.

Found a wrong date? Open an issue with the provider URL that proves it, or edit
the YAML directly — there is a link on every model page.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full data conventions.

## License

MIT. The data is free to use, including commercially. Made by
[Manifest](https://manifest.build).
