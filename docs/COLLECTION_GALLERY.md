# Collection gallery — B010

The default app now opens a virtualized 52-face **draft artwork preview**. Search by full rank/suit/series, filter suit/series, sort rank or suit, favorite preview faces for the current session, and open a card to inspect its front/back. Preview entries have no instance ID or ownership/history. The previous static CatalogPreview component was replaced, not relabeled as granted cards.

## Managed guest session and owned-gallery boundary

`CollectionApp` (named export from mobile App.tsx) accepts a `CollectionConnection` containing the trusted API base URL, a non-secret account/session key and `getAccessToken(): Promise<string>`. The host must supply a verified managed-session integration with platform-appropriate secure credential storage and token refresh, and change/remove the session key on logout or account change. Requests obtain a fresh token from the getter; the backend verifies every token/owner. The mobile client never calculates ownership, grants, eligibility or card power.

The Expo root now wires the official Supabase 2.118.0 SDK when both public provider settings are configured. It restores the session, offers explicit guest sign-in, binds the provider token through the authoritative API and supplies the gallery connection only after API verification. Foreground native refresh follows AppState; account/logout changes reset the gallery key and abort old reads. Async provider work is outside the SDK auth-state callback to avoid lock/deadlock issues.

Configure ignored mobile `.env` with EXPO_PUBLIC_SUPABASE_URL (HTTPS origin), EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (`sb_publishable_...`) and the API URL; match the backend's configured issuer/JWKS and migrated development DB per AUTH.md. Do not supply service-role/secret keys. No token is accepted from URLs, environment values, globals, pasted input or preview fixtures. Missing/invalid provider configuration fails closed to the preview; no project was created/contacted in this work.

Credentials are namespaced by provider origin, preventing cross-project reuse. Native credentials use Expo SecureStore 58.0.2 with device-only unlocked access and Android backup exclusion. A serialized two-bank adapter stores at most 32 chunks/bank, each 400 Unicode code points (at most 1,600 UTF-8 bytes), committing a pointer only after every chunk succeeds. Failed replacements retain the old complete session; bounded leftovers are cleared and logout removes both banks. Corrupt/incomplete/oversized data fails rather than silently creating a replacement guest. Web uses tab-scoped sessionStorage, not localStorage; the UI explains that closing the tab loses guest access. No biometric prompt is introduced.

Disconnect is explicit and warns that an unlinked guest may become inaccessible. It clears the private view immediately, requests local API and provider revocation, attempts provider sign-out and credential clearing independently of server-revocation failure, and suppresses automatic reconnect even when revocation cannot be confirmed. Failed local cleanup is reported explicitly with Retry account cleanup; starting another guest stays disabled until provider/local cleanup succeeds. Native deletion attempts both banks even after one entry fails, reports incomplete cleanup and supports retry. Email/social linking and administrative MFA are not implemented in this host; real-provider anonymous/restore/refresh/logout/linking acceptance still remains B005 work. The configured code path is prepared, not claimed observed against a real project.

The adapter was exercised against the real API and runner-owned PostgreSQL with signed test JWTs for inventory, favorites, history, loadout save/replay and current validation. This verifies the protocol, not an actual Supabase or native session. Do not inject fixture ownership into the running application to claim account acceptance.

## Inventory, filters and inspection

The inventory DTO now includes server-resolved series ID/name, template version, active status and favorite preference in addition to instance identity, face, earned rarity/level/branch and version. It omits private provenance and reservations. The starter grant receipt remains its separate original version-one contract; richer current-inventory fields do not change grant or replay semantics.

Owned inventory is explicitly paginated in pages of 100 and merged by immutable instance ID. Load more reaches overflow inventory; no 100-card truncation, auto-discard or ownership deletion occurs. The interface shows shown/loaded counts and clearly states that filters apply to loaded cards when more pages exist. It does not silently rank or auto-select rarer cards.

All card tiles name the full English rank and suit, with preview status or owned rarity/level/reservation status. Suit text complements color. Controls have labels and minimum 48-point height; text scales and the grid changes columns with available width. FlatList virtualizes cards rather than mounting an entire large inventory. The inspector scrolls and has an explicit close control plus the platform close handler. Physical accessibility and focus behavior still need device/browser verification.

Owned art is explicitly a **face/back reference**, not a claim that a series' commercial artwork was delivered. Known rank/suit geometry is rendered locally; the back reference reflects the server branch without faking earned trims. Authenticated series-art/CDN publication and reviewed production artwork remain with the content/publishing gates. No arbitrary remote SVG or token-bearing image URL is loaded.

History is fetched on demand with bounded version pages, displaying safe human action/date labels and actor categories. Raw reasons/operator IDs/source keys/lock material remain internal. The instance ID is visible to its owner. Preview cards have no history or equip action.

## Favorites and loadout staging

`PUT /v1/cards/{id}/favorite` accepts strictly `{favorite:boolean}` for the owner. The boolean PUT is idempotent; repeated/concurrent same-value requests persist one preference row. Opposite requests are last-commit-wins. The transaction rechecks session/user/expiry and card ownership under the established account/session/card lock order. Preference changes never alter CardInstance or OwnershipEvent. Inactive cards can retain their preference for future archive views; active inventory still excludes consumed/revoked cards.

Migration `202610290001_card_favorites` creates only a preference table with an exact owner/instance FK and composite key. Its disposable reversal drops preferences only. Deployed recovery requires reviewed forward repair/backup restore; never reset inventory/history to undo a preference feature. Logs contain fixed operation/status, not card/user/token data. Existing authorization/rate/body-size protections remain.

Choosing a card stages that exact instance for its face. Reserved cards cannot be newly selected. An explicit Select this complete deck control is available only for a fully loaded, unambiguous 52-face available deck; it does not choose among duplicates. Save sends the entire mapping, expected version and a native-generated UUID idempotency key. An ambiguous network outcome retains the original command/key for Retry pending loadout save, preventing accidental new writes; server rejection explains refresh/reconnect. The server's current selection is fetched after success. No hand is admitted or dealt here.

## Verification and remaining acceptance

Run:

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev:api
# In another terminal:
pnpm dev:web
```

Open <http://localhost:8081>. Try rank/suit/series search and filters, sorting, preview favorites, opening a face, switching front/back, closing details and the Your collection boundary. The old Check API connection button is replaced; liveness remains <http://localhost:3001/health>.

Automated checks: `pnpm ci:quality`, `pnpm ci:database`, `pnpm ci:audit`, OpenAPI validation, `expo install --check`, and separate iOS/Android `expo export`. Mobile tests are typechecked under Expo's tsconfig so React Native globals do not contaminate Node API tests. React Native Web semantic rendering tests mock the native SVG bridge; vector bytes are covered by existing art tests and bundles. These are not live browser, touch, VoiceOver or TalkBack evidence.

The SDK checker required React Native 0.88.1 and React DOM types 19.3.0; both are pinned. Expo Crypto 58.0.7 supplies native-safe UUIDs, with no hand-written random-ID generator or window.crypto assumption. Native exports bundle successfully; inspected Xcode remains 26.3 versus the documented SDK 58 Xcode 26.4+ requirement. No native compile/physical-device run is claimed.

Live browser visual verification was not performed: the prior browser URL-policy block was not retried or circumvented. No new screenshot is represented as evidence. Inspect the preview and then verify on a physical phone: legible 52-card scrolling; full rank/suit announcements; modal focus/close; enlarged text; filters; overflow pagination; favorite persistence; session expiry/account switching; stale save/retry; actual signed-in history/equip. Actual provider setup and approved starter publication are prerequisites for the owned flows. B010 stays pending these acceptance gates; B011 is not treated as an excuse to skip them.

Sources used for platform/session compatibility: [Supabase React Native auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [anonymous users](https://supabase.com/docs/guides/auth/auth-anonymous), [Expo SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [Expo Crypto SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/), [Expo SDK upgrade guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/). The installed vendor matrix/check was the executable version authority.
