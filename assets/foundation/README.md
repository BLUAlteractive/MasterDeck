# Foundation Study — draft original vectors

Source: `packages/ui/src/card-art.ts`. Run `pnpm catalog:export` for 52 front SVGs and one symmetric blue back. Original paths and rank/suit text embed no external images/fonts, copied portraits, wordmarks or branded backs.

Canvas: 240 × 336; rounded outer border; mirrored corner indices at x=22/y=44; distinct suit shapes, correct 2–10 pip counts and simple J/Q/K monograms. Display preview size is 112 × 156.8. Red/black is supplemented by geometry and full English accessible names. Back geometry is centered and 180-degree symmetric, with no earned-level trim.

`manifest.json` records stable catalog IDs, versioned keys, dimensions, exact-byte SHA256, source provenance and INTERNAL_PREVIEW scope. These are definitions, not owned instance IDs. Bundled TypeScript data matches the JSON; CI compares every SVG to its hash and renderer.

This is development art, not asserted commercial rights/name clearance or designer approval. B044 must verify actual approval evidence before publication. Synthetic proof in tests exists only in the owned disposable database.

Do not hand-edit/format hashed SVG exports. Regenerate from source and review the diff. Once persisted, use new versioned keys/IDs for changed content and retain old versions for history.
