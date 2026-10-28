# B003 — Architecture and ADR report

28 October 2026. **Documentation and draft contracts prepared, self-reviewed and locally validated; ready for independent/product review.** No application behavior, executable schema, migration, provider account or production resource changed. B003 branches from validated B002 and will use a stacked PR while B002 remains unmerged.

## Changes

- `docs/ARCHITECTURE.md`: context ownership, package dependency direction, reusable pure engine/deck/RNG seam, authoritative transaction/room recovery and data/privacy boundaries; system diagram.
- `docs/PROTOCOL.md`: planned REST DTO conventions, route ownership, errors, scoped idempotency and typed room envelopes/projections; transaction and room sequence diagrams. Today's health behavior is distinguished from future conventions.
- `docs/ENVIRONMENTS.md`: current variable ownership, future identity configuration slots, local/test/staging/production separation and launch/stop/troubleshooting/verification commands.
- `docs/adr/0001-platform-boundaries.md`: modular API/worker decision, Supabase Auth adapter selection, alternatives, implications, rollout/rollback and review gates.
- `docs/REQUIREMENT_COVERAGE.md`: all 82 ticket IDs mapped to requirements, dependency/integration gaps, notifications/season-pass acceptance gaps and scoped B004 schema handoff.
- `architecture/API_CONTRACT.yaml`: actual health contract, explicit planned-operation markers, missing UUID path parameters, master-aligned trail start/complete names and six inherited YAML comma/description errors corrected. Planned business operations still need complete schemas in their owning tickets.
- `docs/DECISIONS.md`: master §20/register D-ID crosswalk, resolved engineering clarifications and explicitly pending product decisions.
- `README.md`, `backlog/STATUS.md`, this report: navigation, evidence, review state and next ticket.

## Acceptance review

Boundaries and diagrams were self-reviewed against master §§4/7/8/9/20/24, AGENTS, the exploration build contract, all 82 backlog tickets and current shells. The design preserves single-shuffle poker, separate game engines, immutable rules/collection snapshots, private per-recipient projections, atomic grants and distinct currencies. No scoring, paid-economy or legal exception is inferred. A protocol diagram is design evidence, not an implemented crash/recovery test.

Supabase Auth is an engineering adapter selection supported by official anonymous/linking/signing-key documentation; native linking, issuer configuration and account conflict/deletion behavior must be proven in B005. No credentials or SDK were added. R-07–R-11 remain gated, and multi-lap protocol details, map/data licensing, native proof capabilities, notification scope and season-pass acceptance require the designated reviews.

The combined database prompt was scoped using the backlog: B003 architecture first, B004 executable persistence next. The draft Prisma remains deliberately unvalidated and nonexecutable; B003 does not claim migration acceptance. Independent/product review is pending, rather than silently treating this self-review as approval.

## Commands and actual results

- Repository/document inventory, source/config review and `git status --short`: baseline clean; reviewed authoritative docs and assigned row.
- `git switch -c architecture/b003-foundation`: separate branch created from B002 tip `00a1cdd`.
- Pinned Redocly registry/engine query: CLI 2.72.0 supports the workspace Node version. Initial `pnpm dlx @redocly/cli@2.72.0 ...` was ambiguous because the package has two binaries; the runbook now uses the explicit binary.
- `pnpm --package=@redocly/cli@2.72.0 dlx redocly lint architecture/API_CONTRACT.yaml --extends spec`: first found six inherited malformed description properties; corrected them and reran successfully with no validation errors. This validates document structure, not future endpoints.
- `pnpm ci:quality`: passed formatting, lint, strict types, all 14 tests in 3 files and 10 package builds. No low-impact documentation-only tests were added.
- `pnpm ci:database`: explicitly deferred to B004; no Prisma validation pass claimed.
- `pnpm ci:audit`: exit 0, one low finding, no high/critical findings. Existing scoped Expo compatibility risk remains documented in B002.
- `pnpm dev:api`, `pnpm dev:web`: documented local startup worked; HTTP requests returned expected health JSON, web preview HTML/title and exact `Access-Control-Allow-Origin: http://localhost:8081`. Processes stopped after verification.
- Python local Markdown-link and CSV coverage checks: zero broken local links; all 82 ticket IDs covered, including expanded ranges.
- Final formatting and `git diff --check` passed; tracked-environment/credential-pattern checks found zero tracked private env files and zero known token/private-key patterns. This limited pattern scan is not a comprehensive secret audit. Public local sample credentials are intentionally retained in templates; no production secret is supplied by this change.

## Remaining risks and next ticket

This is a documented engineering baseline, not production readiness. No device, auth-provider, database migration, real multiplayer, privacy-purge or paid-store acceptance is claimed. Unimplemented business DTO schemas and feature-specific concurrency/retention thresholds remain their tickets' responsibility. No merge is performed as part of B003.

Next smallest ticket: **B004 — Database foundation**. Follow its scoped handoff; do not copy the entire draft schema or build gameplay while creating migrations. Owner review of the recorded product gates is required before their affected features, not before safe foundational database work.
