# B044–B053 — Administration, privacy and release preparation

Implemented the next ten scoped engineering tickets on stacked branches, each committed after local validation and submitted as a draft PR. Acceptance is recorded without waiving external requirements. **Production/beta release remains NO-GO.** No production deployment, legal approval, live provider activation or paid gameplay change was performed.

| Ticket | Engineering result                                                                                           | Evidence / review                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| B044   | Scoped catalog draft, independent manifest reviews, publish/retire and audited cosmetic offer switches       | [Report](B044_REPORT.md), [PR 43](https://github.com/BLUAlteractive/MasterDeck/pull/43) |
| B045   | Participant reports/blocks, scoped suspension/reinstatement and private audited dispute replay               | [Report](B045_REPORT.md), [PR 44](https://github.com/BLUAlteractive/MasterDeck/pull/44) |
| B046   | Audited reconciled operations aggregates and disclosed WEC/latency coverage                                  | [Report](B046_REPORT.md), [PR 45](https://github.com/BLUAlteractive/MasterDeck/pull/45) |
| B047   | Adaptive navigation, onboarding and optional original foreground sound/haptics                               | [Report](B047_REPORT.md), [PR 46](https://github.com/BLUAlteractive/MasterDeck/pull/46) |
| B048   | Measured contrast/source audit and shared conservative reduced motion/motor controls                         | [Report](B048_REPORT.md), [PR 47](https://github.com/BLUAlteractive/MasterDeck/pull/47) |
| B049   | Least-privilege tournament operations, delayed paid-proof recovery, headers/secret gate and dependency fixes | [Report](B049_REPORT.md), [PR 48](https://github.com/BLUAlteractive/MasterDeck/pull/48) |
| B050   | Observed 500-room/1,000-user private transport load and transactional failure recovery                       | [Report](B050_REPORT.md), [PR 49](https://github.com/BLUAlteractive/MasterDeck/pull/49) |
| B051   | Separate consent, bounded owner export and provider-verified deletion with retained provenance               | [Report](B051_REPORT.md), [PR 50](https://github.com/BLUAlteractive/MasterDeck/pull/50) |
| B052   | Observed clean database/assets restore and complete authoritative replay in CI                               | [Report](B052_REPORT.md), [PR 51](https://github.com/BLUAlteractive/MasterDeck/pull/51) |
| B053   | Signed release preflight, deployed-config guards, empty environment templates and incident/rollback runbooks | [Report](B053_REPORT.md), draft PR linked on this chat                                  |

All changed files are enumerated in [the complete Git manifest](B044_B053_CHANGED_FILES.txt), relative to `/Users/bobbyjohnson/Documents/Codex/DeckForge/deckforge`. Comparison starts at batch base `3ad146b`; the manifest includes new reports and operational templates. Individual reports explain touched areas and limitations. Application rules remain strict TypeScript and server-authoritative; no optional vendor/AR/NFT/partner adapter was placed on the launch path.

## Commands and observed validation

Executed pinned dependency installation (`pnpm add` for SDK-matched feedback modules and direct tooling Zod, then `pnpm install --frozen-lockfile --offline`); Prisma format/generate and owned migration diff; targeted TypeScript/lint/Vitest while developing; full `pnpm ci:quality`; `pnpm security:check`; `pnpm ci:audit`; owned `pnpm ci:database`, explicit `pnpm ci:load` and final `pnpm ci:recovery`; release validation and deliberately failing unsigned `pnpm release:check`; Expo configuration introspection and HTTP root/bundle probes; Git diff checks, per-ticket commits/pushes and draft PR creation/attachment. Ordinary code/file searches and inspection commands are omitted here. Detailed results/log locations and corrections appear in each ticket report.

| Ticket | Unit cases / files | Owned DB evidence                                            |
| ------ | ------------------ | ------------------------------------------------------------ |
| B044   | 295 / 53           | 143 cases twice                                              |
| B045   | 295 / 53           | 147 twice                                                    |
| B046   | 297 / 54           | 150 twice                                                    |
| B047   | 299 / 55           | No DB change; prior 150 twice retained                       |
| B048   | 302 / 57           | No DB change; prior 150 twice retained                       |
| B049   | 304 / 58           | 153 twice                                                    |
| B050   | 305 / 59           | 156 twice including two observed 500-room runs               |
| B051   | 308 / 60           | 162 twice; optional load case skipped                        |
| B052   | 308 / 60           | 162 twice plus observed clean restore; optional load skipped |
| B053   | 315 / 62           | Final owned recovery regression recorded below               |

Every full quality run passed formatting, lint, strict types and 11 workspace builds. Final dependency audit exits zero with one inherited low deepmerge advisory in trusted Expo configuration processing; no high/critical advisories were reported. The earlier moderate minimatch/glob paths were patched with exact-version overrides and actual lint/Expo builds verified. This is engineering evidence, not an independent penetration test or fraud guarantee.

The B050 fixture connected 1,000 distinct signed users to 500 simultaneous unfunded canonical room actors; both runs completed 500 hands with zero private-card failures. Join p95 was 72/70 ms and command p95 51/51 ms on this laptop. This does not establish production/distributed/mobile/soak or 500 funded-table capacity. Controlled backend cancellation rolled back all journal effects; stable source/command retries committed once. See [load baseline](load/b050-owned-500.json).

B052 restored 87 public tables/11,576 rows, all 55 poker and 7 Spades histories, 32 settled poker allocations, 4 settled Spades outcomes and 57 original asset files. Wallet mismatches/missing origins were zero. Database restore took 300 ms; fully verified frozen-fixture recovery 2,166 ms. The initial CLI barrel-import failure was corrected and rerun; it is not counted as successful recovery. These timings are not production RPO/RTO. See [restore baseline](recovery/b052-owned-restore.json).

The actual release checklist is valid in shape and **unsigned/NO-GO**; require-go exits 1 as intended. Ephemeral unit-test signatures confer no real authority. CI validates the shape without inventing approval. A release additionally requires trusted role-scoped signatures for the exact artifact/evidence/flags and an independently reviewed clean environment; no human checklist or staging traffic rollback was fabricated.

The existing local services returned HTTP 200 for API `/health`, Expo `/`, and the actual `/apps/mobile/index.ts.bundle?...` JavaScript (5,161,089 bytes). This proves service/bundle delivery, not native physical-device journeys or authenticated live feature activation. No browser navigation policy was bypassed.

## Launch locally

Prerequisites: Node 22.22.x, pnpm 10.30.2 and Docker Desktop. From the repository:

```sh
cd /Users/bobbyjohnson/Documents/Codex/DeckForge/deckforge
pnpm install --frozen-lockfile
pnpm setup:local
pnpm infra:up
pnpm db:deploy
pnpm db:seed
pnpm dev:api
```

Keep that terminal running. In a second terminal:

```sh
cd /Users/bobbyjohnson/Documents/Codex/DeckForge/deckforge
pnpm dev:web
```

Open <http://localhost:8081> and check <http://localhost:3001/health>. Optional separate terminal: `pnpm dev:admin` for <http://localhost:3000>. Stop services with Ctrl+C; `pnpm infra:down` stops local infrastructure while retaining its volume. Do not run reset merely to apply migrations. Setup preserves existing ignored env files, so review their URLs if they came from an older setup. Never apply these local credentials to a deployed environment.

The default gallery is explicitly an artwork preview. Managed guest access requires a real **development** Supabase project with asymmetric JWKS/anonymous auth and the documented public mobile/provider plus protected API configuration. Main still supplies no approved live gameplay/commerce/retention/provider policies. Do not expect preview cards, a client-entered step count or a public env flag to grant inventory, balances or functional upgrades. Deployed staging/production processes need the stricter empty templates and approvals in [launch operations](LAUNCH_OPERATIONS.md).

Reproduce checks with `pnpm ci:quality`, then `pnpm ci:recovery` (Docker required), `pnpm security:check` and `pnpm ci:audit`. Only the runner's owned disposable database is reversed/reset. `pnpm ci:load` explicitly enables the heavier 500-room measurement. `pnpm release:check` currently fails deliberately because launch approval is absent. Detailed privacy behavior and retained-record limits are in [privacy operations](PRIVACY.md).

## Open acceptance and next work

Actual operator provisioning/MFA, licensed commercial art/name rights, terms/moderation/appeal staffing, reviewed regional privacy/retention/export support, real provider deletion/backup erasure, platform IAP/refund tests, protected signing/receipt/privacy keys, deployed monitoring/alert delivery, production backup/PITR and staging application traffic rollback remain open. Android SDK/device evidence is absent; installed Xcode 26.3 is below the SDK's required 26.4+ baseline. Automated/web checks cannot close VoiceOver/TalkBack, scaled text, permission/battery, two-device or native sound/haptic acceptance.

MASTER_SPEC's core B060–B082 earned-pack/Press/Explore and two-platform end-to-end requirements still gate beta, despite their placement after B053/B054 in the CSV. P2 adapters B055–B059 remain optional. B054 is next numerically, but **B060 is the next implementable core review** while distribution remains blocked. Reconcile its three-wallet criteria against B038's existing implementation, then continue in dependency order. No scoring, paid-power or legal boundary was changed to force a launch.

Final B053 database result: **162 passed in 31 files twice**, one explicit optional load skip per run, with successful clean restore/replay and complete owned rollback/reset/reseed (`/tmp/deckforge-b053-recovery-final.log`, 140,719 ms). The repeat restore again matched all 87 tables/11,576 rows and 57 assets; it took 311 ms for database restoration and 2,227 ms through full verification. [Exact final aggregate](recovery/b053-owned-restore.json). Hosted quality/dependency checks for PRs 43–51 were observed green; B053's hosted result is reported after its draft is created.

Final B053 quality result after the complete configuration/signature guards and report assembly: **315 unit tests in 62 files; all 11 builds; format/lint/strict types passed** (`/tmp/deckforge-b053-quality-final.log`). Frozen offline install, dependency audit and diff checks passed. The complete manifest contains **124 changed files**. Ten draft PRs preserve per-ticket review scope; no PR was merged or production deployed.
