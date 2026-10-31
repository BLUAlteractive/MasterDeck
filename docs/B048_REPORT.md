# B048 — Accessibility audit

Audited source/automated coverage and made scoped reduced-motion and motor-affordance fixes. All 52 tiles retain redundant full rank/suit names and suit shapes; no original immutable art hash was changed. Added measured palette/ink contrast checks and rendered label/control checks. Shared motion preference defaults safe and now suppresses gallery modal fade; native screen-reader/device sign-off remains explicitly open.

Files: UI contrast utility/export/two tests, mobile shared motion context, CardTile/Gallery/Action and rendered motion/control acceptance coverage; ACCESSIBILITY_AUDIT.md, decisions/status/report. No persistence/API/economy change.

`pnpm ci:quality` passed 302 tests in 57 files, formatting/lint/strict types and 11 builds (`/tmp/deckforge-b048-quality-release.log`). Existing native-SVG-isolated tests provide the 52-face label evidence; the new checks avoid duplicating that coverage or treating Node as a native renderer. No database code changed; B046's 150 integration cases twice remain applicable. The audit matrix distinguishes verified code/renderer facts from unexecuted VoiceOver/TalkBack, scaled-text, focus/keyboard and real-device journeys. B035's full Press alternative still depends on B068/B069; no proof or completion is fabricated. Next: B049 security audit.
