# main sync PR safety review — 2026-10-05

- Verified at: 2026-10-05 23:47:02 KST (clock tool).
- Scope: live GitHub open PR metadata, current-main actual Git diff names/merge bases, added-patch secret patterns and one bounded Mangwon UI compatibility review.
- Repository: pds2225/walk; checkout roots D:\walk and D:\walk\.worktrees\worldcup-market-clean-20261004.
- Pinned live main: 404c5a8c2d3e70a1e808e1d0f3410fd65234f37d. Parent integration branch: integrate/all-development-20261005.
- Latest explicit user instruction authorizes main integration and replaces earlier main/Ready/merge prohibitions. This reviewer performed no code changes or Git/GitHub mutation; parent owns integration/merge/push.

| PR | Pinned head | Draft | GitHub state / checks | Actual scope vs current main | Classification |
|---|---|---|---|---|---|
| [143](https://github.com/pds2225/walk/pull/143) | 77707a403de2e5be9a4ae7904a92e998617b9d28 | yes | CLEAN / MERGEABLE; docs/test/Vercel success | 19 files, World Cup Market route/data/UI plus TASK and cjs lint config | independent feature; include |
| [130](https://github.com/pds2225/walk/pull/130) | 3e1dcef6b240c16bda521975ce3eac50c7e42917 | yes | CLEAN / MERGEABLE; docs/test/Vercel success | 4 files: TASK.md, eslint.config.js, web/lib/useNavigation.ts, web/lib/useNavigation.test.ts | independent navigation fix; include |
| [142](https://github.com/pds2225/walk/pull/142) | 48dbb7b8821ef9f04e406d6d616a3aae0d89d31c | yes | MERGEABLE / UNSTABLE; test failure, other checks success | 3 files: home page and useGeolocation source/test | independent display smoothing; include with shared lint fix |
| [136](https://github.com/pds2225/walk/pull/136) | d86427db089efdf7c40b3294a4c3613865aa052d | yes | CONFLICTING / DIRTY; test failure, Vercel rate limit and pending aggregate | 23 files; separate /mangwon route/data/UI; overlap TASK/i18n/DestinationWalk and legacy CSS/deploy changes | independent Mangwon feature; extract into integration and resolve overlaps |
| [135](https://github.com/pds2225/walk/pull/135) | 225eef8f825776fd01d008775a3e59a605e32212 | no | CONFLICTING / DIRTY; old web typecheck failure | 16 historical Mangwon files | exact ancestor of #136; duplicate, preserve without separate merge |
| [100](https://github.com/pds2225/walk/pull/100) | 438221f18f7e7617ba672093eefe7b1b98051fb6 | no | MERGEABLE / BEHIND; only old neutral/success checks | 2 Streamlit transit source/test files | separate candidate; parent must check whether current behavior already implements the patch |
| [101](https://github.com/pds2225/walk/pull/101) | b94f8f26b4d7b1479fc55cbd87a51cef1e78a47e | no | MERGEABLE / BEHIND; old checks only | deletion-only 35 streamlit_task_organizer files, no added feature | preserve as separate cleanup scope; exclude from feature integration |

## Actual blockers and stale metadata

#142 and #136 test jobs fail while loading @typescript-eslint/await-thenable against scripts/vercel-ignore.cjs without TypeScript parserOptions. Failed-run IDs: 37098453100 and 36697448956. This is the shared lint configuration failure, not evidence of feature-test failure. #143 already contains the bounded scripts/**/*.cjs disableTypeChecked + Node globals correction. Its feature integration should retain that correction; do not revive the older scripts/vercel-ignore.cjs file-ignore workaround from #130 when resolving eslint.config.js.

#135's run 35074768768 fails web typecheck. It needs no independent repair/merge because all eight of its commits are ancestors of #136. GitHub compare 225eef8...d86427d reports ahead 33, behind 0, merge base 225eef8.

GitHub PR130 metadata is stale against an older base. The pulls API reports base SHA 6a71f40d047e9e79618c438868242e4d2a55c0ba, while the live main ref is 404c5a8. GitHub files reports 13 historical files and a large TASK replacement; direct git merge-base(main, 3e1dcef) is current main and its actual three-dot diff is only 4 files (+23 TASK, +2 eslint, +112 navigation tests, +74/-10 navigation source). Thus current #130 does not touch AGENTS, Streamlit, transit_builder or Vercel config. File-count/deletion claims and merge decisions must use the actual pinned main Git diff. CI conclusions above are tied to the pinned heads, but their old PR bases are not final integration validation.

The parent's single integration PR approach avoids repeated CI across overlapping branches. Conflicts remain real for #136, and appending TASK from #130/#143/#136 needs preservation of all newly registered tasks. Parent final integration checks and smoke are required; this reviewer has not rerun tests.

## Mangwon / home / World Cup compatibility

Against d86427d:

- web/app/page.tsx is exactly identical to current main (514 lines); no redirect to /mangwon. /mangwon/page.tsx is a separate 44-line route and uses the common DestinationWalk props.
- Root layout adds only two Mangwon CSS imports. globals.css preserves the existing main 306-line prefix and appends 404 lines; all appended selectors and both separate CSS files are Mangwon-prefixed.
- Remove the root layout additions during integration; extract only the 404-line Mangwon CSS suffix into route CSS and import it plus mangwon-mobile-overrides.css and mangwon-storefront.css from /mangwon. Keep root layout/globals unchanged. This mirrors World Cup route isolation and avoids global stylesheet growth.
- DestinationWalk has exactly the same executable source in #136 and #143; only two documentation lines say Mangwon versus World Cup. Keep the already integrated World Cup component rather than duplicating it.
- Removing the added MangwonUiText/interface/record/getter block from the #136 i18n source yields the main i18n content exactly. Add that named block next to the WorldCupMarket block and preserve existing home/voice strings. There are no Mangwon/WorldCup export-name collisions.
- scripts/vercel-ignore.cjs differs from current main only by two explanatory comments and vercel.json by formatting. Retaining main deployment config loses no Mangwon feature.
- Apply #142 GPS smoothing narrowly to the navigation home while preserving its existing ko/en/ja/zh UI.

## Secret/protected-file and preservation checks

All seven pinned PR added patches and their available actual current-main added diffs were scanned for provider-key formats, private-key blocks and quoted credential assignments. Zero pattern candidates; no omitted GitHub file patches. No changed .env or .github/workflows path in these PR scopes. Only filenames/counts/kinds would be printed for candidates; no local credential/environment values were read.

Confirmed remote backup: backup/worldcup-market-demo-20261004 = 6200e12fbc3e49bde8e5c9d2834003829bec51c4. Preserve it; it is not an integration feature. Preserve #135/#101 histories and the parent's root dirty snapshots. Local uncommitted changes/worktrees and any non-PR branch feature comparison remain the parent's separate inventory responsibility.

Merge status: no merge/Ready/close/push was performed by this reviewer. Recheck live remote heads and the integration branch's minimal gates before the parent completes the authorized main sync.
## Additional closed/merged branch review

Exact branch/head metadata and merge-commit ancestry against main404c5a8 establish that the following patch-id-unique branches are already integrated:

| Branch | Exact head / PR | Merge commit in main | Finding |
|---|---|---|---|
| fix/knavi-prefield-verifier-20260829 | 9ea6e43 / [120](https://github.com/pds2225/walk/pull/120) | 46edd2b9d766d1f9030f0f74224fd4d4ed07820a | MERGED; ancestor=True |
| claude/destination-search-input-bug-asbhp2 | 0c1c0e6 / [108](https://github.com/pds2225/walk/pull/108) | f55ec263f3fde06ecb8cc7e5c2e93e21eb88fa93 | MERGED; ancestor=True; earlier [107](https://github.com/pds2225/walk/pull/107) also merged at 3ce8e3c909cebb17db95488eb7228e0e80477263 |
| ci/merge-gate-20260813 | ed96439 / [106](https://github.com/pds2225/walk/pull/106) | 8d5ce9ef0743842e4fef4635858116d05d132f75 | MERGED; ancestor=True |
| chore/task-ssot-20260923 | 0a47be7 / [140](https://github.com/pds2225/walk/pull/140) | 40daf37f0b1008980f3af80ab98ede1526fa8da2 | MERGED; ancestor=True |
| chore/vercel-project-isolation | 0a9880d / [141](https://github.com/pds2225/walk/pull/141) | 404c5a8c2d3e70a1e808e1d0f3410fd65234f37d | MERGED; equals pinned main |

These refs need preservation/synchronization, rather than reapplying their historical patches.

### Cursor cloud branch remains an unclassified functional candidate

`cursor/cloud-agent-1787756290065-ub3dw`, head `8931ba790393b966ceeb02dbc78aefa13276d655` (2026-09-22): branch-head PR lookup, commit-associated PR API and route_score/agent-id PR searches each returned no records. Within that search scope there is no evidence it was intentionally closed or squash-integrated. Do not label it superseded solely because other parts resemble main.

Current main lacks `streamlit_walk_engine/route_score.py`, its test, `web/components/Roadview.tsx`, and `web/lib/kakaoJsKey.ts`. The branch's route_builder source has `_score_and_pick` at line1573 importing route_score at1582 and the route engine entry at1604; this is an actual wired feature candidate, not merely documentation. This metadata review does not decide whether its algorithm is still appropriate; parent functional-gap review owns that decision.

The commit also includes seven generated .pytest-tmp fixture paths and web/.env.local.example. Do not import the whole commit without filtering; preserve artifacts separately and leave protected environment files untouched. This reviewer examined names/declarations only and did not read environment-file content or key values. No code or Git mutation was performed.
