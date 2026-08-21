# Daily source snapshots implementation plan

Plan, 2026-08-20. Implements
`docs/superpowers/specs/2026-08-20-daily-source-fetch-design.md`.

## Goal

Add daily, deterministic source-page change detection. The implementation opens
or updates snapshot-only pull requests. It never edits model YAML, runs an LLM,
or merges its own pull request.

Keep each code file below the repository's 300-line limit and each function below
50 lines. Use dependency injection for network, time, sleep, and filesystem
boundaries so tests stay offline and deterministic.

## Task 1: Registry schema and offline validation

Files:

- add `sources.yaml`;
- add `src/sources/registry.ts`;
- extend `src/data/paths.ts`;
- extend `src/data/validate.ts`;
- add `tests/sources-registry.test.ts`;
- add focused fixtures under `tests/fixtures/sources/` only if inline fixtures
  become hard to read.

Steps:

1. Add failing tests for:
   - valid rows;
   - unknown fields;
   - duplicate provider/slug pairs and duplicate URLs;
   - provider ids absent from the modelparams.dev taxonomy and unsafe slug values;
   - non-HTTPS URLs, credentials, fragments, and non-`.md` paths;
   - invalid byte bounds and empty required markers;
   - `catalog_provider` naming a missing provider directory;
   - rejection of the legacy `zai` provider id;
   - a resolved snapshot path escaping the snapshot root.
2. Implement a strict Zod schema and YAML loader in `registry.ts`.
3. Resolve snapshot paths from validated slugs only. Confirm the resolved path
   remains under `SNAPSHOTS_DIR`.
4. Add `SOURCES_FILE`, `SNAPSHOTS_DIR`, and `SOURCE_FETCH_DIR` constants to the
   shared paths module.
5. Add all 16 stable seed rows to `sources.yaml` with modelparams.dev provider
   ids. Map `z-ai` temporarily to the current `models/zai/` catalog directory.
6. Call registry validation from `npm run validate`. Format errors with the same
   file-and-message style as catalog validation.
7. Run:
   - `npm run validate`;
   - `npm test -- tests/sources-registry.test.ts`;
   - `npm run typecheck`.

Success: malformed registries fail offline, all seed paths are safe, and the
current catalog still validates.

## Task 2: Guard one HTTP response

Files:

- add `src/sources/fetch-source.ts`;
- add `src/sources/report.ts`;
- add `tests/sources-fetch-source.test.ts`.

Steps:

1. Define the versioned report schema first. Keep error codes as a closed enum.
   Do not allow response body or header fields in the schema.
2. Define an injected transport interface around `fetch`, plus injected clock
   and sleep functions for retry tests.
3. Add failing tests for:
   - `text/markdown` and `text/markdown; charset=utf-8`;
   - HTML or a missing Content-Type;
   - every `3xx`;
   - immediate non-retryable `4xx`;
   - retry and exhaustion for network errors, timeout, `408`, `429`, and `5xx`;
   - bounded `Retry-After`;
   - oversized `Content-Length`;
   - a streamed body exceeding `max_bytes`;
   - invalid UTF-8;
   - `min_bytes`, `max_bytes`, required-marker, and 40-percent-shrink failures;
   - CRLF/CR and trailing-whitespace normalization with one trailing newline.
4. Implement manual redirect handling. Do not inspect or follow `Location`.
5. Stream through a byte counter. Decode UTF-8 in fatal mode.
6. Return normalized bytes and sanitized metadata. Return only internal error
   codes and messages for failures.
7. Keep retry counting exact: three total attempts.
8. Run:
   - `npm test -- tests/sources-fetch-source.test.ts`;
   - `npm run typecheck`;
   - `npm run lint`.

Success: one source can be fetched safely without touching disk, and no
provider-controlled text enters the report.

## Task 3: Runner, atomic snapshots, and exit codes

Files:

- add `src/sources/run.ts`;
- add `src/sources/fetch.ts`;
- add `tests/sources-run.test.ts`;
- update `package.json`;
- update `.gitignore` with `.source-fetch/`.

Steps:

1. Add failing tests for:
   - unchanged and changed snapshots;
   - a source error leaving its baseline byte-identical;
   - mixed success/error results;
   - at most four in-flight fetches;
   - the ten-minute run deadline;
   - temporary-file cleanup after a failed write;
   - atomic rename after `fsync`;
   - bounded report serialization;
   - UTC `started_at`;
   - exit `0`, `2`, and `1` behavior.
2. Implement a small concurrency pool. Do not add a dependency for it.
3. Fetch all sources into memory-bounded per-source results.
4. For a valid change, write a sibling temporary file, sync it, and rename it.
   Never write a target for an error result.
5. Write `.source-fetch/report.json` through the same temporary-file pattern.
6. Add `sources:fetch` to `package.json`.
7. Keep the CLI thin: parse arguments, call the runner, print a one-line summary,
   and set `process.exitCode`.
8. Run:
   - `npm test -- tests/sources-run.test.ts`;
   - `npm run sources:fetch -- --help`;
   - `npm run typecheck`;
   - `npm run lint`.

Success: a local run produces deterministic tracked changes and a transient,
sanitized report with distinct source and fatal failure exits.

## Task 4: Safe seeding and snapshot consistency

Files:

- add `src/sources/seed.ts`;
- add `tests/sources-seed.test.ts`;
- extend registry validation;
- update `package.json`;
- add `snapshots/<provider>/<slug>.md` for all 16 rows.

Steps:

1. Add failing tests for:
   - one selected missing snapshot;
   - refusal when the selected target exists;
   - `--all-missing` creating only absent targets and overwriting none;
   - scheduled fetch refusing a missing baseline;
   - registry rows with no snapshots;
   - orphaned snapshots with no registry row.
2. Share response guards with `fetch-source.ts`; do not duplicate fetch logic.
3. Add `sources:seed` to `package.json`.
4. Fetch the 16 stable real pages once from the implementation branch. Exclude
   the general xAI models page because repeated responses reorder table rows.
5. Use the observed byte counts to set conservative `min_bytes` and `max_bytes`.
   Choose at least one stable required marker per source.
6. Inspect every initial snapshot before committing it. Confirm Content-Type,
   source identity, expected section headings, and the absence of an error/login
   page.
7. Re-run offline tests after disconnecting from the network.

Success: each registry row and snapshot is a reviewed pair, and no command can
replace an existing baseline through the seed path.

## Task 5: Artifact allowlist validation

Files:

- add `src/sources/artifact.ts`;
- add `src/sources/validate-artifact.ts`;
- add `tests/sources-artifact.test.ts`;
- update `package.json`.

Steps:

1. Add failing tests for:
   - malformed or unsupported report versions;
   - unknown source ids;
   - unsafe relative paths;
   - files outside `snapshots/`;
   - a reported hash or byte count mismatch;
   - an unexpected extra file;
   - an oversized file or artifact;
   - an `unchanged` or `error` row carrying a changed file;
   - a `changed` row missing its file.
2. Validate the artifact against the checked-out default-branch registry.
3. Copy only validated changed snapshot paths into the checkout.
4. Emit a second sanitized publication manifest. It can contain source ids,
   hashes, byte counts, timestamps, and internal error codes only.
5. Add a `sources:validate-artifact` script.
6. Run:
   - `npm test -- tests/sources-artifact.test.ts`;
   - `npm run typecheck`;
   - `npm run lint`.

Success: the credentialed publication steps can consume only an allowlisted,
bounded file set and sanitized metadata.

## Task 6: Source-issue state transitions

Files:

- add `src/sources/issues.ts`;
- add `tests/sources-issues.test.ts`;
- add a publication adapter used by the workflow.

Steps:

1. Model issue behavior as a pure transition first:
   - no issue plus failure opens one;
   - open issue plus repeated failure updates last-seen without a new comment;
   - open issue plus recovery comments once and closes;
   - closed issue plus recurring failure reopens the same issue.
2. Match issues through the stable hidden source marker, not title only.
3. Build titles and bodies only from registry fields, UTC dates, and the internal
   error-code table.
4. Never include response headers, redirect targets, or response bodies.
5. Keep the GitHub API adapter small. Pass its token only at the publication
   step.
6. Run:
   - `npm test -- tests/sources-issues.test.ts`;
   - `npm run typecheck`;
   - `npm run lint`.

Success: each source has one durable failure issue with quiet repeat behavior and
explicit recovery.

## Task 7: Daily workflow and one pull request

Files:

- add `.github/workflows/sources.yml`;
- add `tests/sources-workflow.test.ts` if useful for static workflow assertions;
- document required repository secrets in the workflow comments or maintainer
  documentation.

Repository setup:

- create a GitHub App with only Contents, Pull requests, and Issues write access;
- add `SOURCE_FETCH_APP_ID` and `SOURCE_FETCH_APP_PRIVATE_KEY` secrets;
- allow the App-created pull request to run normal repository workflows.

Workflow steps:

1. Trigger daily at `0 4 * * *` and through `workflow_dispatch`.
2. Add one non-cancelling concurrency group.
3. Pin every action to a full commit SHA.
4. Fetch job:
   - set `contents: read`;
   - check out the default branch with `persist-credentials: false`;
   - set up Node 20 and run `npm ci`;
   - run `sources:fetch`, preserving exit `0` versus `2`;
   - fail without a publishable artifact on exit `1`;
   - upload snapshots and report on exit `0` or `2`.
5. Publish job before token creation:
   - download into a separate directory;
   - run `sources:validate-artifact`;
   - copy allowlisted snapshots into the checkout;
   - build the sanitized publication manifest and bounded pull-request body.
6. Mint the short-lived GitHub App token only after validation.
7. With step-scoped token exposure:
   - apply issue transitions from the sanitized manifest;
   - create or update branch `automation/source-snapshots`;
   - use title `chore: refresh provider source snapshots`;
   - include only allowlisted snapshot files;
   - delete the automation branch after merge when supported;
   - never enable auto-merge.
8. Ensure a no-change/no-error run skips token creation and publication.
9. Ensure mixed changes and errors update both the snapshot pull request and the
   relevant issues.
10. Add static tests or assertions for fixed branch/title, credential persistence,
    workflow permissions, pinned actions, and snapshot-only path filters.

Success: reruns update one pull request, App-created pull requests trigger normal
CI, and the fetch job has no write credential or application secret.

## Task 8: End-to-end verification

Local checks:

1. Run the focused source tests.
2. Run:
   - `npm run lint`;
   - `npm run typecheck`;
   - `npm run validate`;
   - `npm test`;
   - `npm run build`.
3. Run an unchanged fetch and confirm `git status --short` is clean except for
   intentional implementation files.
4. With the stub transport, run:
   - one valid change;
   - one source failure;
   - one mixed run;
   - one fatal report/write failure.
5. Confirm the failed-source baseline remains byte-identical in every failure
   case.
6. Confirm reports and generated pull-request text contain no provider body text.

GitHub smoke after App secrets exist:

1. Dispatch the workflow with unchanged sources. Confirm it opens nothing.
2. Use a reviewed test fixture or temporary registry test endpoint to produce one
   safe snapshot change. Confirm one pull request opens and normal CI runs.
3. Dispatch again before merge. Confirm it updates the same branch and pull
   request.
4. Exercise a source failure. Confirm one issue opens and the old snapshot stays.
5. Exercise recovery. Confirm the same issue closes.
6. Remove all test-only state before merge.

Final review:

- compare the implementation with every phase-one invariant in the design;
- inspect the workflow token boundary line by line;
- confirm `git diff -- models` is empty;
- confirm no Anthropic secret, LLM action, catalog edit, or auto-merge path exists.

Success: all seven design acceptance criteria pass, the full repository suite is
green, and the change is ready for a normal human-reviewed pull request.
