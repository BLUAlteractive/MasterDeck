# B002 — Automated CI implementation report

27 October 2026. **Implemented locally; acceptance blocked by the unresolved dependency advisory and missing GitHub remote.** No hosted run or enforced branch protection is claimed.

## Changes

- `.github/workflows/ci.yml`: separate quality and dependency-audit jobs, read-only permissions, commit-pinned actions, frozen installs, tool version logs, pnpm store caching, timeouts and cancellation, PR/main/merge-queue/manual triggers.
- `scripts/ci-database.mjs`: explicit B004 deferral; fails closed if an executable schema or migrations appear before real validation is configured.
- `package.json`: `ci:quality`, `ci:audit`, `ci:database` commands.
- `services/api/package.json`, `pnpm-lock.yaml`: express-rate-limit 8.7.1 and its patched ip-address dependency; no application behavior or product rules added.
- `README.md`, `docs/CI.md`, `docs/DECISIONS.md`, `backlog/STATUS.md`, this report: usage, security findings, decisions and remaining acceptance.

## Commands and evidence

| Execution                                                                            | Actual result                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`, `git remote -v`                                                | Initially clean; no remote.                                                                                                                                                                                                                                          |
| `git ls-remote` on official checkout v6, setup-node v6 and pnpm/action-setup v4 tags | Resolved full SHA pins used in workflow.                                                                                                                                                                                                                             |
| `pnpm audit --audit-level=high --json`                                               | Initial failure: three high findings involving express-rate-limit, ip-address and Expo CLI's Zod.                                                                                                                                                                    |
| `pnpm why -r zod ip-address express-rate-limit`; registry version/dependency queries | Confirmed dependency paths and Expo CLI's Zod 3 requirement.                                                                                                                                                                                                         |
| `pnpm install`                                                                       | Updated the rate limiter and lockfile successfully.                                                                                                                                                                                                                  |
| `pnpm ci:audit`                                                                      | Still exits 1: one high finding, GHSA-mrhx-c7xc-m3w5 through Expo CLI/Zod 3. The other two high findings are gone.                                                                                                                                                   |
| actionlint 1.7.12, `-shellcheck= .github/workflows/ci.yml`                           | Passed workflow syntax/expression/action-input validation. Official release downloaded to `/tmp`, SHA256 verified; external shellcheck not run. Initial Python HTTPS download failed due local CA configuration; curl retry retained TLS verification and succeeded. |
| Temporary failing Vitest assertion + `pnpm ci:quality`                               | Exit 1 caused by the named assertion; build step not reached. Probe removed in `finally`.                                                                                                                                                                            |
| `pnpm ci:quality` after removing probe                                               | Passed formatting/lint/types, 9 tests in 2 files, all 10 package builds.                                                                                                                                                                                             |
| `pnpm ci:database` without executable schema                                         | Exit 0 with explicit DEFERRED TO B004 message; not a schema-validation pass.                                                                                                                                                                                         |
| Temporary schema-path probe + `pnpm ci:database`                                     | Correctly exited 1. Temporary file removed.                                                                                                                                                                                                                          |

Final clean reproduction also passed: a fresh temporary workspace excluded `node_modules`, caches, generated outputs and developer `.env` files, then ran `pnpm install --frozen-lockfile --offline`, `pnpm ci:quality` and `pnpm ci:database` with the same CI/telemetry environment as the workflow. This used the local downloaded package store and a macOS host, not a GitHub-hosted Linux runner. Final actionlint, formatting, lint and `git diff --check` passed; both temporary failure probes are absent.

The rate-limiter update was exercised by existing real HTTP health/CORS tests. No financial, inventory or gameplay code changed. No migration or production data operation occurred.

## Remaining work

- A compatible fix for the Expo CLI transitive Zod advisory is required. No ignore list, cross-major override or audit failure suppression was added.
- The owner must identify the GitHub remote. Actual hosted Linux runs, the hosted failure experiment and required-check enforcement remain unverified. See [CI activation instructions](CI.md).
- Prisma and migration tests are deferred explicitly to B004. B002's guard prevents silent omission when persistence lands.
- Native/device validation remains outside this CI scaffold; these builds cover TypeScript, Next and Expo web.

Next smallest work: resolve the audit/remote acceptance blockers for B002; next planned backlog ticket is B003 — Architecture and ADR.
