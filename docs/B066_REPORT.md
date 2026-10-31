# B066 — Press screen recipe catalog

Added pure exhaustive branch/tier validation, strict earned-only recipe contracts, immutable versioned ScreenPattern/ScreenReview persistence, independent exact-hash review/publication/retirement and a default-unavailable public catalog. No owned screen, card, wallet or job is minted/changed. Prototype requirements/prices remain reviewed data rather than production defaults; paid functional modifiers and terminal/cross-branch recipes are rejected.

Changed files: card-domain screen recipe helper/test and index; contracts press schema/test and index; Prisma schema, screen-pattern migration/disposable rollback; API press catalog/controller and wiring; screen fixture/database acceptance; decisions, status, screen catalog guide and this report. Production rollback retains recipe evidence; actual reverse SQL is disposable-only.

Validation: `pnpm ci:quality` passed formatting/lint/types, 331 tests in 71 files and all 11 builds (`/tmp/deckforge-b066-quality.log`). Database/recovery and tracked-secret evidence is recorded below after completion. Actual economy/rights approval, active-job snapshot integration and real device evidence remain open; future tickets implement entitlement and progress. Next smallest ticket: B067 screen purchase and inventory.

Final owned `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='do the next 15' pnpm ci:recovery` passed 181 database cases in 36 files twice, one optional load skip, Prisma validation/deploy/seed, 100-table clean restore/game replay with zero ledger/origin mismatches and complete reverse migration/reset/reseed (153 seconds, `/tmp/deckforge-b066-recovery.log`). `pnpm security:check` passed. No existing database or live configuration was changed.
