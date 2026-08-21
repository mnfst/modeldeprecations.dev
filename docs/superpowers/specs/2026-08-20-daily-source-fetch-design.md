# Daily source snapshots

Design, revised 2026-08-20.

## Decision

Ship change detection before catalog authoring.

The first pull request adds a source registry, a deterministic markdown fetcher,
committed snapshots, failure tracking, and snapshot-only pull requests. It does
not run a large language model (LLM), edit model YAML, or hold an Anthropic key.

Provider pages are untrusted input. Passing that text to an agent with repository
credentials creates a prompt-injection path. Catalog authoring stays out of scope
until provider policy is current and a deterministic provenance check can reject
a proposed date that is absent from its cited snapshot.

This split delivers the first useful outcome: a provider-page change is visible
within one day, preserved in a reviewable pull request, and never merged
automatically.

## Why

The catalog is hand-sourced. `last_verified` records when a human checked a page,
but the repository does not detect later changes to that page.
`.github/workflows/refresh.yml` rebuilds the site daily; it does not fetch source
pages.

The fetch is simple. The safety requirements are not:

- a failed or truncated response must not replace a valid baseline;
- an HTML error page must not pass as a markdown twin;
- a rerun must update one open pull request instead of creating duplicates;
- timestamps must not dirty the repository on an unchanged day;
- provider-controlled text must not reach an agent, shell command, issue body,
  pull-request body, or workflow expression that has credentials;
- one source failure must not hide valid changes from other sources.

## Scope of the first pull request

In scope:

- the 16 stable, verified `text/markdown` pages listed below;
- an offline-validated `sources.yaml` registry;
- a bounded fetcher with content, redirect, size, and truncation guards;
- one committed markdown snapshot per registry row;
- a bounded transient JSON report;
- one stable automation branch and at most one open snapshot pull request;
- one tracked GitHub issue per failing source, including recovery handling;
- unit tests with no network access.

Out of scope:

- all catalog edits under `models/`;
- all LLM or agent execution;
- `canonical`, `shape`, and other extraction-only registry metadata;
- HTML extraction and providers that require it;
- the host-as-provider rewrite in `CONTRIBUTING.md`;
- the `amazon` to `bedrock`, `qwen` to `alibaba`, and `zai` to `z-ai`
  catalog migrations.

Markdown twins cover 255 of the 385 current entries. The existing providers
without a twin remain uncovered: Mistral (53), Google (34), Qwen (26), Amazon
(8), DeepSeek (5), and Xiaomi (4).

## Registry: `sources.yaml`

The root registry contains only fields that the fetcher enforces.

```yaml
sources:
  - provider: openai
    slug: deprecations
    catalog_provider: openai
    url: https://developers.openai.com/api/docs/deprecations.md
    min_bytes: 8000
    max_bytes: 100000
    required_markers:
      - Deprecations
```

Fields:

- `provider` uses the modelparams.dev provider taxonomy. `slug` matches
  `^[a-z0-9][a-z0-9-]*$`. Their pair is unique and becomes
  `snapshots/<provider>/<slug>.md`.
- `catalog_provider` is optional. When present, it names the current catalog
  directory and that `models/<catalog_provider>/` directory must exist. This is
  a temporary bridge for `provider: z-ai` to the current `models/zai/` directory.
- `url` is a unique HTTPS URL with no credentials or fragment. Its path ends in
  `.md`. Redirects are not followed.
- `min_bytes` and `max_bytes` bound the normalized UTF-8 body. Both are required,
  positive integers, and `max_bytes` is greater than `min_bytes`.
- each non-empty `required_markers` string must occur in the body. These
  source-specific fingerprints reject same-sized login, abuse, and error pages.

The registry does not infer coverage from URL hosts. Provider slugs and hosts are
different concepts, and host-wide matching captures unrelated pages. A later
catalog-authoring design can add explicit source-to-entry mappings when needed.

### Seed rows

Provider ids follow modelparams.dev now. The current catalog directory remains
`models/zai/`, so the two `z-ai` rows use `catalog_provider: zai` until the
separate catalog migration lands.

| id                       | catalog provider | URL                                                                      |
| ------------------------ | ---------------: | ------------------------------------------------------------------------ |
| `openai/deprecations`    |         `openai` | `https://developers.openai.com/api/docs/deprecations.md`                 |
| `openai/models`          |         `openai` | `https://developers.openai.com/api/docs/models.md`                       |
| `anthropic/deprecations` |      `anthropic` | `https://platform.claude.com/docs/en/about-claude/model-deprecations.md` |
| `anthropic/models`       |      `anthropic` | `https://platform.claude.com/docs/en/about-claude/models/overview.md`    |
| `cohere/deprecations`    |         `cohere` | `https://docs.cohere.com/docs/deprecations.md`                           |
| `cohere/models`          |         `cohere` | `https://docs.cohere.com/docs/models.md`                                 |
| `groq/deprecations`      |                — | `https://console.groq.com/docs/deprecations.md`                          |
| `cerebras/deprecations`  |                — | `https://inference-docs.cerebras.ai/support/deprecation.md`              |
| `fireworks/changelog`    |                — | `https://docs.fireworks.ai/updates/changelog.md`                         |
| `perplexity/changelog`   |                — | `https://docs.perplexity.ai/docs/resources/changelog.md`                 |
| `xai/may-15-retirement`  |            `xai` | `https://docs.x.ai/developers/migration/may-15-retirement.md`            |
| `z-ai/releases`          |            `zai` | `https://docs.z.ai/release-notes/new-released.md`                        |
| `z-ai/pricing`           |            `zai` | `https://docs.z.ai/guides/overview/pricing.md`                           |
| `moonshot/models`        |       `moonshot` | `https://platform.kimi.ai/docs/models.md`                                |
| `minimax/releases`       |        `minimax` | `https://platform.minimax.io/docs/release-notes/models.md`               |
| `minimax/api-overview`   |        `minimax` | `https://platform.minimax.io/docs/api-reference/api-overview.md`         |

The general xAI models page was excluded after repeated fetches showed two table
rows changing order nondeterministically. Its fixed retirement notice remains in
scope.

`npm run validate` loads the registry offline in addition to the model catalog.
Validation resolves every generated snapshot path under the snapshot root before
any network or file operation.

## Snapshots and transient state

Tracked files contain source content only:

```text
snapshots/<provider>/<slug>.md
```

The fetcher normalizes CRLF and CR to LF, removes trailing spaces and tabs, and
adds one trailing newline. It makes no other content change. A snapshot contains
no frontmatter, timestamp, status, or fetch metadata.

Run metadata is written to `.source-fetch/report.json`. The entire
`.source-fetch/` directory is ignored by git. There is no committed
`snapshots/index.json`, so `fetched_at` cannot create a daily no-op diff.

The versioned report contains:

- one UTC `started_at` timestamp;
- per source: id, URL, `unchanged`/`changed`/`error`, attempt count, byte counts,
  and before/after SHA-256 values;
- for errors: a stable code and internal message capped at 500 characters.

The report never contains response bodies, response headers, unified diffs, or
other provider-controlled text. Git supplies the pull-request file diff.

## Fetcher: `src/sources/fetch.ts`

`npm run sources:fetch -- --report .source-fetch/report.json` processes at most
four sources concurrently and applies a ten-minute run deadline.

For each row:

1. Send `GET` with a fixed User-Agent, a 20-second attempt timeout, and
   `redirect: manual`.
2. Make at most three total attempts. Retry network errors, timeouts, `408`,
   `429`, and `5xx`. Honor `Retry-After` up to 30 seconds; otherwise use bounded
   exponential backoff with jitter. Other `4xx` responses fail immediately.
3. Reject every `3xx`. A move requires a reviewed registry change. Rejecting all
   redirects also prevents cross-host moves, HTTPS downgrades, and loops.
4. Parse the Content-Type media type case-insensitively. Accept
   `text/markdown` with optional parameters such as `charset=utf-8`. Reject all
   other media types.
5. Enforce `max_bytes` while streaming the decoded body, not only through
   `Content-Length`. Reject invalid UTF-8.
6. Normalize line endings and enforce the byte bounds and required markers.
7. With an existing baseline, reject a body more than 40 percent shorter. A
   failed guard leaves the baseline unchanged.
8. Compare normalized bytes. For a change, write a temporary sibling file,
   `fsync` it, and rename it atomically over the target.
9. Continue after source errors. A fatal registry, report, or filesystem error
   stops the run.

Exit codes:

- `0`: every source fetched successfully; snapshots can be unchanged or changed;
- `2`: one or more source errors occurred and the report is complete;
- `1`: a fatal local error made the output unreliable.

The workflow handles exit `2`, so successful changes still proceed. Exit `1`
never publishes a pull request.

### Bootstrap and new rows

The scheduled command never creates a missing baseline. A registry row and its
first snapshot are reviewed together.

`npm run sources:seed -- <provider>/<slug>` fetches exactly one missing snapshot
with the same guards. It fails if the target exists. An explicit
`--all-missing` option is allowed for the initial implementation pull request,
but it also refuses to overwrite files. CI checks that each registry row has one
snapshot and that no snapshot is orphaned.

This removes a special first scheduled run and prevents accidental baseline
replacement.

## Workflow: `.github/workflows/sources.yml`

The workflow runs daily at `04:00 UTC` and through `workflow_dispatch`. A
concurrency group prevents overlap. Third-party actions are pinned to full commit
SHAs.

### Fetch job: no credentials

The fetch job has `contents: read`, checks out the default branch with
`persist-credentials: false`, installs locked dependencies, and runs the
fetcher. It has no repository write token and no application secret.

The job uploads changed snapshots and the bounded report after exit `0` or `2`.
It uploads nothing publishable after exit `1`.

### Validate before credentials

A separate publish job downloads the artifact before it mints a token. Trusted
code from the default branch validates the report schema, registry membership,
safe relative paths, file sizes, hashes, and changed-file allowlist. It rejects
unexpected files, copies the validated paths into the checkout, and never
evaluates snapshot content.

### Publish with a short-lived token

After artifact validation, the job mints a short-lived GitHub App installation
token with only `contents: write`, `pull_requests: write`, and `issues: write`.
An App token, unlike the default `GITHUB_TOKEN`, lets the resulting pull request
trigger the normal `pull_request` CI and data-guard workflows.

After token creation, no LLM and no code that reads snapshot bodies runs. The
token is exposed only to pinned issue and pull-request publication steps. The
issue step consumes the validated sanitized report; the pull-request step stages
the allowlisted snapshot paths as opaque files.

Raw provider bytes are never interpolated into a shell command, workflow
command, action input, issue body, pull-request body, or branch name.

## One idempotent pull request

Automation uses branch `automation/source-snapshots` and title
`chore: refresh provider source snapshots`.

If the pull request is open, the workflow updates that branch. It starts from
the current default branch and overlays all successful current snapshots. If the
pull request was merged or closed, it creates a new branch and pull request.
Same-day reruns are idempotent, and an unmerged change does not create a daily
duplicate.

The pull-request body contains source ids, byte counts, hashes, run timestamp,
and a review checklist. It does not embed provider text or unified diffs. The
GitHub Files view is the review surface.

A snapshot-only pull request is valid. No model YAML edit is expected in this
phase. The workflow never merges its pull request.

## Mixed results and source issues

Source errors do not discard successful changes:

- each failed source keeps its snapshot and gets an opened or updated issue;
- each successful changed source can update the snapshot pull request;
- a fatal local error publishes neither issues nor a pull request.

Each issue has marker `<!-- source-fetch:<provider>/<slug> -->` and label
`source-fetch`. Automation finds it by marker, not title. It does not add a
daily comment to an open issue. It updates the last-seen UTC date and error code.
On recovery, it comments once and closes the issue. A recurring failure reopens
that issue.

Issue text comes only from the trusted registry and internal error-code table.
It never includes a response body, header value, or redirect target.

## Phase-one invariants

The automation never:

- edits model YAML;
- runs an LLM or exposes an Anthropic key;
- merges a pull request;
- overwrites a snapshot after a guard fails;
- follows a redirect;
- treats HTML as markdown;
- commits timestamps or transient metadata;
- creates more than one open snapshot pull request;
- passes provider text to a credentialed interpreter.

The existing data guard is not claimed as enforcement for these invariants. It
currently blocks model-page removal, alias removal, removal of all sources from
a dated entry, and lifecycle-date changes without a later `last_verified` date.
It does not block every catalog-data deletion.

## Tests

Vitest uses an injected transport and temporary directories. Tests use no
network.

Registry and path cases:

- malformed YAML, unknown fields, duplicate ids, and duplicate URLs;
- unsafe provider and slug values, including traversal and separators;
- non-HTTPS URLs, credentials, fragments, and non-`.md` paths;
- modelparams.dev provider ids and `catalog_provider` directory agreement,
  including the temporary `z-ai` to `zai` bridge;
- invalid byte bounds, empty markers, missing snapshots, and orphan snapshots.

Fetcher cases:

- unchanged and changed bodies;
- `text/markdown; charset=utf-8` acceptance and HTML rejection;
- redirect rejection;
- `408`, `429`, `Retry-After`, `5xx`, timeout, and retry exhaustion;
- streaming maximum-size and oversized `Content-Length` rejection;
- minimum size, 40-percent shrink, marker, and invalid UTF-8 failures;
- bounded concurrency and run deadline;
- atomic replacement and interrupted-write cleanup;
- partial failure with successful changes preserved;
- no overwrite on error;
- bounded reports with no response text;
- UTC timestamp and line-ending normalization.

Bootstrap and workflow-contract cases:

- seed refuses to overwrite;
- scheduled fetch refuses a missing baseline;
- artifact validation rejects malformed reports, unknown paths, mismatched
  hashes, extra files, and oversized files;
- reruns target one fixed branch and pull request;
- issue open, recovery, close, reopen, and recurrence behavior;
- mixed errors and changes publish issues and a partial snapshot pull request;
- fatal errors publish nothing.

Implementation validation:

```text
npm run lint
npm run typecheck
npm run validate
npm test
npm run build
```

## Acceptance criteria

1. An unchanged run leaves the tracked tree clean and does not update a pull
   request.
2. A valid change updates only its snapshot and the one automation pull request.
3. A failed source leaves its snapshot byte-identical and updates its one issue.
4. A mixed run publishes valid changes and reports failures independently.
5. Repeated runs before merge update the same branch and pull request.
6. The automation pull request triggers the normal CI workflows.
7. No step that interprets provider content can access a write token or secret.

## Later pull requests

1. **This design:** markdown registry, guarded fetcher, seed snapshots, failure
   issues, and snapshot-only pull requests.
2. Rewrite `CONTRIBUTING.md` for the host-as-provider rule.
3. Rename `amazon` to `bedrock`, `qwen` to `alibaba`, and `zai` to `z-ai`, with
   redirects and the existing `allow-data-regression` override where required.
4. Add an HTML adapter for Mistral, Google, Alibaba, Bedrock, DeepSeek, Xiaomi,
   Vertex, and Thinking Machines/Tinker.
5. Design catalog proposals separately. Before any LLM is considered, add a
   deterministic proposal schema and provenance validator. Each proposed date
   carries a snapshot id plus an exact byte range or quote. Validation confirms
   the quote and literal ISO date exist in that snapshot. Use
   `src/schema/model.ts` or generate JSON Schema at runtime; do not assume a
   committed `schema.json`.

A future LLM stage runs without repository credentials or write tools and emits
data only. A separate trusted consumer validates paths, schema, provenance, and
the allowed diff before it can create a human-reviewed pull request. Model
identity, aliases, hosted ids, replacements, source-access dates, and
`last_verified` semantics must be specified before that stage is approved.

## Open source gaps

- **Meta:** `llama.developer.meta.com/docs/llama-api-deprecation/` returns `500`
  to scripted fetches. Do not add it until the primary page can be fetched and
  read directly.
- **NVIDIA:** no single canonical NIM model-deprecation page was found. Current
  retirements live in forum threads.
- **Thinking Machines/Tinker:** the page has no markdown twin. It is the first
  target for the HTML adapter. Because retired rows can disappear, retain a
  reviewed manual copy as research input before the adapter lands; do not
  present that copy as an automated baseline.
