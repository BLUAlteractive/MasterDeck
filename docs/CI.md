# Continuous integration — B002

## Checks

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, merge queue groups and manual dispatch. It has no path filters, deployment credentials, write permissions or `pull_request_target` execution. Third-party actions are pinned to verified full commit SHAs. Checkout does not retain Git credentials.

| Required check name | Command                                    | Behavior                                                                                                                                                      |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality checks      | `pnpm ci:quality`, then `pnpm ci:database` | Formatting, lint, strict types, unit/HTTP tests and all builds; stop immediately on failure. Isolated database checks are described below.                    |
| Dependency audit    | `pnpm ci:audit`                            | Audit the full dependency graph, including tooling; high/critical advisories and registry errors fail the job. No advisory exceptions or `continue-on-error`. |

Both jobs clean-install the frozen lockfile and print Node/pnpm versions. Node comes from `.nvmrc`, pnpm from `package.json#packageManager`. Only pnpm's download store is cached through setup-node, keyed by the lockfile; `node_modules`, `.env`, framework outputs and Turbo artifacts are not restored from CI caches. The audit job disables package install scripts. Quality builds use no private credentials or developer `.env` files.

## Local reproduction

```bash
pnpm install --frozen-lockfile
pnpm ci:quality
pnpm ci:database
pnpm ci:audit
```

`ci:audit` needs registry access. On 28 October 2026, the full audit passes the high/critical threshold with one low finding remaining. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) was removed by a scoped compatibility override: only `@expo/cli@58.1.17>zod` resolves to patched 4.6.7. No audit finding is suppressed.

Expo's latest stable CLI still declares Zod 3. This is a project-maintained compatibility remediation, not an upstream-supported dependency range. Both CLI Zod consumers were inspected; `scripts/expo-cli-compat.test.ts` exercises plugin descriptors, text/audio/image output validation, MCP parameters, strict parsing and JSON Schema conversion with valid and invalid inputs. It also pins the reviewed CLI/Zod versions so an upstream CLI update requires review. B006 updated Expo to the recommended 58.0.21 patch; CLI 58.1.17 still declares Zod 3 and both inspected consumers are byte-identical to 58.1.16. The exact-version compatibility gate now targets 58.1.17. Remove the override and compatibility tests when a verified Expo release uses patched Zod natively. See [remediation evidence](B002_REMEDIATION.md).

The API's express-rate-limit was updated from 8.2.1 to 8.7.1, resolving its rate-limit advisory and updating transitive ip-address to 10.7.5. Both corresponding high-severity findings disappeared on re-audit.

## Isolated database checks — B004

`ci:database` now creates its own temporary PostgreSQL 17.6 container, never reading a caller database URL. It validates/generates the pinned Prisma 7.10.1 client, deploys migrations twice, checks status, seeds twice, and runs database constraint/concurrency tests. It exercises a test-only reversal, verifies tables were removed, resets the owned temporary database, reseeds and reruns tests. Cleanup removes only that container. GitHub Ubuntu runners supply Docker; no staging/production credentials or shared database are used.

The API health response remains liveness-only. See [database instructions](../prisma/README.md) for schema scope, transaction conventions, manual reset safety and Prisma's explicit-consent guard for local agent reset checks. The old B004 deferral has been replaced; failures in any database stage fail **Quality checks**.

## GitHub activation and merge protection

The public repository is [BLUAlteractive/MasterDeck](https://github.com/BLUAlteractive/MasterDeck); B002 is [PR #1](https://github.com/BLUAlteractive/MasterDeck/pull/1). Publication and OAuth workflow authorization are complete.

`main` protection was verified through the GitHub API: pull requests and up-to-date branches are required; **Quality checks** and **Dependency audit** are bound to the GitHub Actions app (15368). Protection includes administrators; force pushes and branch deletion are disabled. No approving review count is required.

- [Deliberate failure run](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40637659188): the named assertion failed, quality stopped before builds, and the PR reported `BLOCKED`.
- [Run after removing the probe](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40637856692): quality passed on Ubuntu (9 tests, 10 package builds); the database handoff explicitly reported deferred. Audit failed on the remaining high Expo CLI/Zod advisory (plus one low finding).

The probe is absent from the current branch. These runs record the original blocker; the follow-up remediation and current acceptance are tracked in [B002 remediation](B002_REMEDIATION.md). No merge or bypass was performed.

Sources: [setup-node caching](https://github.com/actions/setup-node), [pnpm setup](https://github.com/pnpm/action-setup), and [GitHub required-check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).
