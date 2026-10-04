# PR #143 coordinate and panorama safety review

- Review mode: bounded read-only source/metadata audit; no implementation or Git mutation.
- Repository: `D:\walk\.worktrees\worldcup-market-clean-20261004`.
- Branch: `feat/worldcup-market-demo`.
- Reviewed base/local HEAD/origin target: `b8bfdfce264350a83b27248086c0c91411685d94`.
- Result: **PASS for scope/data provenance/protected files/secret-pattern safety**. Final test/build gates remain the parent agent's responsibility.
- Policy: ordinary commit/push only; no force push, main merge, or Ready conversion. PR #143 stays draft.

## Scope and data preservation

The current diff covers TASK.md and nine World Cup Market source/test files. No untracked or staged files were present at the audited snapshot. Home page, root layout, globals.css, shared roadview.ts/roadviewProviders.ts were unchanged from b8bfdfc. Existing home and voice i18n text was unchanged outside the WorldCupMarket block.

All 45 original `stall({...})` JSON inputs, including every ID/name/original address/source URL/menu/hour/contact/image field, compare exactly equal with b8bfdfc. Location/panorama fields are supplied by new provenance tables rather than rewriting those source inputs. Product prices and image usage-rights statuses remain unknown/rights-check-required.

- `web/lib/worldCupMarketStores.ts:164`: 18 geocoded buildings.
- `web/lib/worldCupMarketStores.ts:186`: 45 source-address evidence entries; 17 blog text and 28 source image pixel confirmations.
- `web/lib/worldCupMarketStores.ts:236`: 18 building panorama entries, 13 unique NAVER pano IDs, capture dates present for all entries.
- `web/lib/worldCupMarketStores.ts:261`: provenance includes source blog URL, evidence address/type/image URL, geocoded address, coordinate source and verification date. Missing evidence or out-of-bounds coordinates return null.
- `web/lib/worldCupMarketStores.ts:300`: navigation uses the geocoded building coordinate; individual entrances/interior locations are explicitly unverified.
- `web/lib/worldCupMarketStores.ts:352`: nearby imagery is distinguished from a confirmed storefront.

Programmatic cross-checks passed against `worldcup-coordinate-evidence-20261004.json`: record IDs, names, original addresses and source URLs; evidence addresses; all 45 geocode coordinates; all blogVerified flags. All 28 image-address confirmations match the source table. All 18 recorded panorama coordinate/ID/capture-date triples match the real NAVER SDK probe artifact. Recomputed maximum building-to-pano distance is 29.08 m; maximum rounding difference from stored values is 0.0049 m.

Coordinates stay exact for shared buildings: 12 shared groups covering 39 stores, with 18 distinct building locations in total. No arbitrary pin spreading was added. `WorldCupMarketMap.tsx:42` only raises the selected marker's z-index; `:113` uses the unchanged coordinate itself.

## UI, fallback and TASK

`WorldCupMarketStreetView.tsx:17` reuses the existing NaverPanoramaAdapter. Configuration failure/open failure yields the availability-aware fallback. Async cancellation closes sessions; normal cleanup closes the session and empties the host. A runtime pano differing from the recorded metadata is disclosed. The recorded pano coordinate is used to request nearby imagery, and the UI does not label it as a confirmed frontage.

The four-language fallback distinguishes map-only, walking-only, neither available, loading and panorama-update states. Shared building coordinates disclose unverified individual entrances. Existing root navigation and common provider selection remain unchanged.

The b8bfdfc TASK body is intact. Exactly one new coordinate task begins at `TASK.md:1081`. Its status is still IN_PROGRESS at this snapshot; final commands/results/limitations must be completed by the parent before reporting completion. The older cleanup task's no-coordinate limitation is historical, not evidence that the new coordinate task is unavailable.

## Secrets, protected files and artifacts

Changed source/test files were scanned for provider-key formats, private-key blocks and quoted credential assignments. **Zero findings**; values would be suppressed if found. No .env or workflow path changed. No actual local key, environment file, cookie or credential value was read or printed by this reviewer.

Evidence/probe/log/pixel artifacts reside outside the clone in `D:\walk\.worktrees`; keep them unstaged. This report also resides outside the clone. The root checkout's seven pre-existing dirty files were not touched by this reviewer; the parent owns the original fingerprint comparison.

## Remaining limits and gate ownership

Browser artifact records eight PASS scenarios and zero page errors for Chrome 390x844, including real map tiles, NAVER panorama and TMAP HTTP 200 for sample stores. This reviewer inspected the artifact, rather than rerunning that browser work. Browser geolocation was controlled; physical field GPS and individual storefront/entrance verification remain pending. NAVER live rendering requires a configured client/domain and network access. Source-image usage rights remain unconfirmed. Panorama captures include older imagery, so recorded metadata is not a current-storefront guarantee.

The parent must attach the final sequential lint/build/typecheck/test/simulate results, resolve the reported concurrent-build timeout by a successful rerun, recheck remote HEAD immediately before an ordinary push, and preserve draft status. No merge authorization is provided by this review.
