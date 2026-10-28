# Catalog and original art — B006

B006 provides shared faces, original draft art, immutable metadata and a public catalog boundary. It grants no instances, sets no odds and implements no game rules.

## Authoring

Pure game-core owns the canonical four suits × thirteen ranks (Ace=14). Card-domain validates 52 unique template faces, 53 assets, correct front/back mappings, safe keys, hash shape, dimensions and original-code/rights evidence. Art identity is separate from template rarity and earned playStyleFamily.

See the [art guide](../assets/foundation/README.md). Regenerate from source with:

```bash
pnpm catalog:export
pnpm test
```

The Node/tsx exporter is authoring tooling, not native/domain I/O. JSON, bundled data and exact-byte SVG hashes must match. SVG exports are excluded from automatic formatting. Source text uses system fonts; no font files or external image assets are distributed.

Seed adds 52 faces, one DRAFT series, 53 INTERNAL_PREVIEW assets and 52 COMMON templates with one earned style family, never player cards. Stable catalog UUIDs are not instance IDs. Repetition preserves local names and refuses changed immutable versions; only the original known no-art rights placeholder may be normalized while DRAFT.

SQL enforces front/back/face consistency, hashes/dimensions/provenance, commercial-evidence presence and immutable asset/template identity/content. Valid metadata alone is not legal approval. B044 owns authorized review/evidence verification, scheduled publishing/CDN and rollback; no publishing endpoint exists here.

## API and local preview

`GET /v1/catalog/series?limit=10&cursor=...` is public/rate-limited and requires a migrated database. Only PUBLISHED, complete approved manifests are returned; malformed/unapproved published rows fail closed with safe 503. Public DTOs expose face/rarity/style and hash-bound references, omitting private source/review evidence.

The default draft is absent from that list. Mobile/web shows its **bundled draft artwork preview**: four 13-face groups and one blue back, not account ownership or a server grant. View it without a provider/database:

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev:api
# Second terminal:
pnpm dev:web
```

Open <http://localhost:8081>. Check API connection tests liveness only. For server catalog queries configure root/API DATABASE_URL, then `pnpm infra:up`, `pnpm db:deploy` and `pnpm db:seed` per the database guide.

## Validation and recovery

`pnpm ci:quality` checks faces, metadata, vectors, artifact hashes, existing auth/HTTP checks and builds. `pnpm ci:database` exercises asset seeding/FKs/immutability, draft filtering and safe public projections using synthetic approval fixtures only in its disposable database, then reverses/reset/reseeds and repeats.

The migration adds assets, nullable legacy-draft art references, template/content guards and selected manifestVersion. Test reversal removes these before auth/foundation reversals; it is not a populated production rollback. Use reviewed forward repair or backup restore in deployed environments. Seed/check logs contain safe status/duration, not ownership/review records.

Expo 58.0.21 and SVG 15.16.0 pass the vendor check. CLI 58.1.17 still requires the reviewed scoped Zod override. iOS/Android bundle export does not imply native compile/device validation; gallery/device/accessibility gates remain B010/B048. B005 actual-provider acceptance is still open. Next owned-collection ticket is B007 after its B005/B006 dependencies.
