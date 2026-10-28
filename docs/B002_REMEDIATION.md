# B002 dependency remediation — 28 October 2026

**Validated locally and on GitHub; ready for review.** This follows the original [B002 report](B002_REPORT.md) and resolves its high dependency finding.

## Changed files

- `pnpm-workspace.yaml`, `pnpm-lock.yaml`: override only Expo CLI 58.1.16's Zod dependency to patched 4.6.7; vulnerable Zod 3 is removed from the resolved graph.
- `scripts/expo-cli-compat.test.ts`: five tests exercise real installed CLI schemas, valid/invalid plugin descriptors and output variants, typed optional MCP parameters, strict command parsing and JSON Schema conversion. Exact version checks require review when dependencies change.
- `vitest.config.mts`, `tsconfig.tests.json`: include tooling compatibility tests in normal CI and strict test typechecking.
- `README.md`, `docs/CI.md`, `docs/DECISIONS.md`, `docs/B002_REPORT.md`, `backlog/STATUS.md`, this report: current remediation, rationale, evidence and removal criteria.

This is a project-maintained compatibility override outside Expo's declared Zod range. It is limited to the inspected CLI version and is not claimed as upstream-supported. No audit suppression or product-rule change was added.

## Commands and actual results

- Registry queries for latest Expo CLI, Expo and Zod 3: CLI 58.1.16 still requires `^3.25.76`; no patched Zod 3 available.
- `pnpm install`: updated the lockfile; removed the vulnerable package.
- `pnpm exec vitest run scripts/expo-cli-compat.test.ts`: 5 tests passed.
- `pnpm ci:quality`: formatting/lint/strict types passed; 14 tests in 3 files passed; 10 package builds passed (9 cached). Initial sandboxed attempt failed to bind the ephemeral API test port; rerun with loopback access passed.
- `pnpm ci:database`: explicit deferral to B004, not a Prisma validation pass.
- `pnpm ci:audit`: exit 0, one low finding; no high/critical findings.
- `pnpm --filter @deckforge/mobile exec expo export --platform ios --output-dir /tmp/deckforge-b002-ios`: passed, Hermes bundle emitted.
- Equivalent Android export to `/tmp/deckforge-b002-android`: passed.
- `pnpm --filter @deckforge/mobile exec expo start --offline --port 8083`, then loopback HTTP requests: development server started, status returned `packager-status:running`, root responded successfully. Local-port permission was required. Server stopped after verification.

Native exports do not prove native compilation or device behavior. One low advisory remains below the established high/critical gate. Database/migration integration belongs to B004. Remove the scoped override and compatibility tests after validating an upstream Expo release with a patched native dependency. Reverting the remediation restores the original audit blocker.

Next smallest planned ticket after hosted acceptance: B003 — Architecture and ADR. No merge is performed as part of this remediation.

## Hosted acceptance

[Run 40694638477](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40694638477) passed both required jobs on Ubuntu at remediation commit `a391fd1`: frozen installation, formatting, lint, types, all 14 tests and all 10 builds, plus the unchanged high/critical dependency audit. The database handoff explicitly deferred to B004. Earlier deliberate-failure evidence and branch protection remain documented in the original report.

B002 implementation is validated and ready for review in [PR #1](https://github.com/BLUAlteractive/MasterDeck/pull/1). The remaining low finding and project-maintained override are documented risks, not hidden audit exceptions. No merge was performed.
