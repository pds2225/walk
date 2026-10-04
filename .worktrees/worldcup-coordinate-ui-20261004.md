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
