# ADR-0001 — Modular authority, provider adapters and contract evolution

Date: 28 October 2026. Status: engineering baseline prepared and self-reviewed for B003; product/legal decisions listed as pending are not approved by this ADR. No product-owner or independent reviewer approval is inferred.

## Context

The monorepo boots locally and CI passes. The product needs reusable pure card rules, authoritative multiplayer and atomic cross-context inventory/economy changes. Early microservices would introduce distributed transaction and deployment complexity before a vertical slice exists. The master allows a managed identity provider, gives two conflicting D-ID namespaces, and supplies draft APIs/schema rather than deployed contracts.

## Decision

1. Use a modular NestJS API, separate worker, PostgreSQL system of record and optional Redis coordination. Pure shared packages contain deterministic rules. Keep adapters at the server/mobile boundaries and deploy modules together initially. This implements the baseline; there is no new infrastructure requirement for local shells.
2. Select **Supabase Auth as the first managed identity adapter for B005**, without moving game tables into a client-accessible Supabase API. Internal users remain independent of the external issuer/subject. Managed anonymous sessions support guest trials; account linking must preserve the same internal user and inventory. No provider is provisioned and no credential/SDK is added in B003.
3. API/socket verification must use an allowlisted issuer, audience and algorithms plus verified signature/expiry from configured asymmetric keys/JWKS. Recheck local suspension, consent and operation-specific authorization. Supabase's `authenticated` role does not imply a permanent account or admin role. Local tests use isolated signed fixtures or a test provider adapter; no production branch accepts a test bypass.
4. Keep the existing public `/health` contract. Add business endpoints under `/v1` as their tickets land. Zod is the implemented boundary source, with corresponding OpenAPI and negative contract tests updated in the same ticket. Planned OpenAPI entries are explicitly marked; no endpoint is advertised as deployed from documentation alone.
5. Follow MASTER_SPEC §8.5 route names for trail start/completion. `POST /v1/trails/{trailId}/start` creates a run; `POST /v1/trails/runs/{runId}/complete` submits session evidence for accepted/review/rejected verification. Multi-lap numbering and final close/pause semantics remain a B076 design gate. The older `/runs` and `/laps` example spellings are removed from the draft; neither has shipped.
6. Use body `idempotencyKey` for transactional business commands, as the master examples specify, and `commandId` for socket commands. Scope by authenticated subject and operation, bind to canonical validated request content, and persist immutable results atomically. See protocol rules for retries/conflicts. Never rely on key TTL alone to protect permanent grant uniqueness.
7. Retain the decision-register D IDs; reference master §20 IDs with an explicit section qualifier. The crosswalk in `DECISIONS.md` resolves naming collisions without rewriting product rules. Product questions R-07–R-11 remain gates, including the shuffle-disclosure privacy conflict.

## Alternatives and consequences

Microservices and a hosted backend SDK writing game/inventory tables directly were rejected for the first slice: they complicate atomicity and would expose authority outside the server. A homegrown password service adds security/operations work unrelated to the card platform. Other managed OIDC providers remain replaceable behind the identity adapter; changing provider requires an ADR, binding migration and link/deletion tests, not a user inventory rewrite.

Supabase is selected for its anonymous and identity-linking capabilities, not as a claim of verified native integration. B005 must prove guest conversion, already-linked-account conflicts, token expiry/rotation, logout/revocation, denied access, admin MFA and deletion in the chosen deployment. Account merging is not silently equivalent to linking: require proof of both identities and an explicit inventory-preservation policy before implementing merges. Native Apple/Google flows and email delivery require actual provider/device configuration later.

No paid economy, scoring formula or legal scope changes. No persisted feature, schema migration or application behavior is introduced by B003. Rollback is documentation reversion; later provider or wire changes require compatibility/migration review before clients are released. Realtime performance, dispute evidence, native integrations and data-retention choices are future acceptance obligations.

## Required follow-up and evidence

B004: pin Prisma compatibility, create only foundational tables, migrations/seeds/rollback and disposable-DB checks. B005: configure separate development/test issuers and prove identity/authorization flows. B014/B018/B020: CSPRNG, durable commands, safe projections/recovery and disclosure policy. Later feature tickets own their specific contracts, transaction tests and metrics.

Reviewed against AGENTS, MASTER_SPEC §§4/7/8/9/20/24, exploration/press build contract, backlog and current code. Engineering review checked pure imports, no client-authoritative balances/outcomes, durable idempotency, hidden-card isolation, v1 Explore inclusion and explicit pending product gates. Independent/product review remains pending in the PR.

Provider references checked 28 October 2026: [anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys). These support adapter selection, not a claim that DeckForge already authenticates users.
