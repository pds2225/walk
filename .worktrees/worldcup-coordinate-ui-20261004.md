# UI implementation log

## 2026-10-04 — Coordinate availability UI

### 1. Scope and design

User's fixed coordinate task for draft PR #143, implemented against
`D:\walk\.worktrees\worldcup-coordinate-ui-design-20261004.md`.
Keep current route, component tree, four locales, mobile layout and styling.
Parent owns TASK/data/API collection/full validation/commit/push.

### 2. Changed files

| Path within worldcup-market-clean-20261004 | Change |
|---|---|
| web/components/WorldCupMarketStreetView.tsx | Prefer metadata panorama coordinates; truthful map/walk/unknown fallback states |
| web/components/WorldCupMarketDemo.tsx | Show shared coordinate count; explicit unknown selected-store location even if other map pins exist |
| web/components/WorldCupMarketMap.tsx | Bring selected overlapping label to front without changing marker position |
| web/lib/i18n.ts | Only WorldCupMarketUiText/WORLD_CUP_MARKET_UI fields: four-locale availability and sharing messages; nearby view title instead of confirmed storefront claim |
| web/components/WorldCupMarketStreetView.test.tsx | Explicit unknown/located fixtures, no-key/no-panorama cases, all fallback states and recorded panorama location |
| web/components/WorldCupMarketDemo.test.tsx | Original browsing regressions use explicit unknown fixtures; located/shared/unlocated map and walking controls tested |

### 3. Assumptions and integration

- Existing store list/names/URLs are unchanged by this UI work.
- Located fixtures use the agreed VerifiedLocation source fields: coordSource, evidenceAddress, sourceUrl, geocodedAddress, source and verifiedAt. Parent adds this data contract.
- Shared coordinates remain identical. Count note makes overlap visible; store list remains the selection path.
- A panorama only proves imagery near a store, not its entrance/frontage.
- No new dependencies or CSS; no home, environment or workflow edits.

### 4. Verification

```powershell
Set-Location -LiteralPath D:\walk\.worktrees\worldcup-market-clean-20261004
npm run test:run -- web/components/WorldCupMarketDemo.test.tsx web/components/WorldCupMarketStreetView.test.tsx
git diff --check
```

Final focused result: 2 files / 17 tests PASS (Demo 8, StreetView 9).
First focused run: 1 test selector failure because a rail button accessible name also contains its category; corrected to the existing named listitem selection path.
Whitespace check passed. Full typecheck waits for parent-owned VerifiedLocation schema fields.

### 5. Remaining validation

- Parent runs npm ci/full lint/build/test/typecheck/simulate and actual Chrome 390x844 pixel and provider verification.
- No real Google key was supplied to this UI implementation, so unit iframe tests are fixtures, not actual panorama validation.
- The existing worldCupMarketStreetView.ts documentation should be updated to describe blog address geocoding + metadata rather than all-null baseline assumptions.

No commit or push by this UI subagent.

## Follow-up — integrated data typecheck

Parent's full web typecheck found that original store.officialSource has type string | null, while verified coordinate sourceUrl correctly requires string. Both owned UI test fixture helpers now guard the blog source and use the narrowed string. The production data type remains strict.

```powershell
Set-Location -LiteralPath D:\walk\.worktrees\worldcup-market-clean-20261004\web
npm run typecheck
Set-Location -LiteralPath D:\walk\.worktrees\worldcup-market-clean-20261004
npm run test:run -- web/components/WorldCupMarketDemo.test.tsx web/components/WorldCupMarketStreetView.test.tsx
```

Web typecheck PASS. Focused rerun after fixture guards: 2 files / 17 tests PASS. No Git mutation, data schema or production code change in this follow-up.

## Follow-up — verified Naver panorama provider

The updated design permits the live authenticated Naver provider using the existing shared NaverPanoramaAdapter. Market StreetView now contains a small provider-specific viewer that uses recorded streetViewLocation, shows visible loading state, handles missing key/metadata/network/pano failures with the existing accurate fallback and closes ready or late asynchronous sessions when unmounted. Recorded/runtime pano mismatch is described as a different nearby panorama, never confirmed storefront imagery. No guessed heading is passed to Naver.

Changed market-only files: WorldCupMarketStreetView.tsx, WorldCupMarketStreetView.test.tsx, WorldCupMarketDemo.tsx (provider badge), i18n.ts (worldcup loading/update copy). Shared roadview.ts, home, CSS, data and TASK remain parent-owned/untouched.

Google fixtures explicitly use provider GOOGLE so metadata switching to NAVER does not change old regression assumptions. New adapter mocks cover success without Google key, missing Naver key, missing panorama coordinate, provider failure, changed pano identity, ready close and close after late asynchronous resolution.

Verification: focused UI 2 files / 24 tests PASS (StreetView 16, Demo 8); web npm run typecheck PASS; git diff --check PASS. Real Naver SDK credentials and Chrome panorama pixels are verified by the parent, separate from unit adapter mocks. No commit/push by this UI subagent.

## Follow-up — isolated viewer failure recovery

QA initially flagged failed-viewer recovery under direct unkeyed component rerender, then clarified the current NearbyScreen already keys outer StreetView by store.id and therefore the actual user transition was already safe. Before that clarification, the parent's minimal defensive-contract request added one inner viewer key based on store ID, panorama coordinates and recorded pano ID, plus one direct rerender regression test. This is defensive isolated-component behavior, not a claimed user-path bug fix.

Focused --maxWorkers=2: 2 files / 25 tests PASS (StreetView 17, Demo 8). Web typecheck PASS after the key addition. Parent will decide whether to retain this small defensive change in final scope.
