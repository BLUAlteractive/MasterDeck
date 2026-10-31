# B060 — Three wallet balances

B038 already supplies the three distinct atomic ledger balances, exhaustive currency/purpose policy and SQL reconciliation. No legacy persisted Credits field exists, so no currency migration or duplicate journal was introduced. Added an authenticated mobile Wallets tab with exact decimal strings, separate earned/paid descriptions, preview isolation and refresh. A database regression proves earned Trail Credits cannot fund Store Gems spending and the complete attempted transaction rolls back.

Files: mobile wallet component/test, collection client/navigation, wallet integration regression, decisions/status/report. No schema or live economy/provider configuration change. Prices/step earn rates remain reviewed versioned proposals, never defaults activated by presentation. Native/device accessibility acceptance remains open.

Validation: `pnpm ci:quality` passed 316 tests in 63 files, format/lint/types and all 11 builds (`/tmp/deckforge-b060-quality.log`). `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='do the next 15' pnpm ci:recovery` passed 163 database cases in 31 files twice, one optional load skip per run, complete clean restore/replay/assets, disposable rollback/reset/reseed (`/tmp/deckforge-b060-recovery.log`, 143 seconds). Next: B061 canonical activity ingestion behind an explicitly unconfigured verifier boundary.
