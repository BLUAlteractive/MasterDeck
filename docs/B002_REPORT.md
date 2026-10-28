# B002 — Automated CI implementation report

27 October 2026. **Implemented and verified on GitHub; acceptance remains blocked by the unresolved dependency advisory.** Hosted quality checks and merge protection are verified.

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
- Hosted execution and protection are verified below. The PR must remain blocked until the high dependency advisory is remediated.
- Prisma and migration tests are deferred explicitly to B004. B002's guard prevents silent omission when persistence lands.
- Native/device validation remains outside this CI scaffold; these builds cover TypeScript, Next and Expo web.

Next smallest work: resolve the audit acceptance blocker for B002; next planned backlog ticket is B003 — Architecture and ADR.

## GitHub validation and publication

The owner approved public publication and the OAuth workflow authorization. B001 commit `1f53715` is published on `main`; B002 is on `ci/b002-foundation` in [PR #1](https://github.com/BLUAlteractive/MasterDeck/pull/1). Earlier upload/authorization blockers are resolved.

Commands executed: `gh auth refresh --hostname github.com --scopes workflow`, `git push`, `gh pr create`, `gh run watch`, `gh run view --log`, `gh pr view`, and GitHub branch-protection API reads/writes through `gh api`.

- [Hosted failure experiment, run 40637659188](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40637659188), commit `daed9fb`: the deliberate failing assertion caused Quality checks to fail; the existing 9 tests passed and builds did not run. GitHub reported the PR as `BLOCKED`.
- The probe was removed in commit `a7a57ea` and pushed.
- [Hosted clean quality run 40637856692](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40637856692): Ubuntu frozen installation, formatting, lint, types, 9 tests and all 10 builds passed. Database validation explicitly deferred to B004. Dependency audit failed with one high and one low finding; the blocking high is GHSA-mrhx-c7xc-m3w5.
- GitHub API confirms `main` requires a PR, up-to-date branches, and both named checks bound to GitHub Actions app 15368. Administrators are included; force pushes/deletion are disabled. Required approving reviews: zero. PR merge state remains `BLOCKED`.

No merge or audit bypass was performed. Temporary failing test code is absent from the branch tip. The GitHub authorization blocker is resolved; the dependency advisory remains the acceptance blocker.
