# PR #143 원본 변경 감사

원래 head: 6200e12fbc3e49bde8e5c9d2834003829bec51c4
기준 main: 404c5a8c2d3e70a1e808e1d0f3410fd65234f37d

## 원본 37커밋

890827d 2026-09-13T21:17:37+09:00 docs: add autonomous Mangwon real-data demo execution spec
fa0d42a 2026-09-13T21:17:54+09:00 chore: activate autonomous Mangwon demo instructions
2aacbc2 2026-09-13T21:51:11+09:00 feat(web): add Mangwon real-data demo
4c8a7cf 2026-09-13T22:31:15+09:00 feat(web): add Mangwon purchase menu data
539781b 2026-09-13T22:54:17+09:00 feat(web): build Mangwon 360 corridor demo
58f4fab 2026-09-13T23:21:20+09:00 fix(web): restore Mangwon 360 embed fallback
961f0bf 2026-09-13T23:25:06+09:00 fix(web): keep roadview effect dependencies stable
225eef8 2026-09-14T11:14:57+09:00 fix(web): make store details the Mangwon demo hero
65e976d 2026-09-14T13:27:24+09:00 feat(web): implement mobile shop detail screen
1eb70eb 2026-09-14T16:01:24+09:00 fix(web): align mobile shop detail with approved mockup
bb57b8c 2026-09-14T16:01:33+09:00 fix(web): load mobile mockup fidelity overrides
0b632ab 2026-09-16T23:53:35+09:00 docs: prepare K-Navi overnight autonomous task queue
c6587cd 2026-09-16T23:55:25+09:00 fix(web): finish Screen 01 hierarchy before overnight build
74fcf13 2026-09-16T23:56:31+09:00 feat(web): add mobile Nearby 360 and map screen
53daeda 2026-09-16T23:57:59+09:00 style(web): finish Nearby 360 map mobile screen
ed08ace 2026-09-16T23:59:40+09:00 test(web): cover Nearby 360 map flow
e240908 2026-09-17T00:00:28+09:00 test(web): cover Street View unavailable fallback
57728fd 2026-09-17T00:01:23+09:00 docs: add overnight resume checkpoint
0de09c1 2026-09-17T00:03:09+09:00 feat(web): add deterministic Google storefront viewer
b8757cb 2026-09-17T00:04:05+09:00 refactor(web): use deterministic storefront 360 viewer
744dc8c 2026-09-17T00:04:28+09:00 test(web): verify deterministic storefront embed fallback
e9f6d23 2026-09-17T00:04:39+09:00 style(web): add deterministic storefront embed styles
548eab0 2026-09-17T00:04:58+09:00 style(web): load storefront embed styles
ccf04a0 2026-09-17T00:05:45+09:00 test(web): align Nearby rail role assertions
05d41cb 2026-09-17T00:09:32+09:00 feat(web): make Mangwon store selection deep-linkable
1a670c8 2026-09-17T00:10:01+09:00 test(web): cover QR-ready store deep links
d03ed89 2026-09-17T00:10:46+09:00 fix(web): complete English representative menu copy
29b33bd 2026-09-17T00:11:28+09:00 fix(web): never present unverified corridor pano as storefront
e13ea08 2026-09-17T00:11:52+09:00 test(web): enforce verified storefront-only fallback
c6f1e8f 2026-09-30T00:43:42Z merge origin/main and drop conflicting Mangwon SSOT docs
19a4e16 2026-09-30T00:50:56Z fix(web): keep the Mangwon demo off the production home
226fcd6 2026-09-30T01:04:35Z fix(web): show Mangwon demo copy in all four languages
e2087be 2026-09-30T01:23:59Z fix(web): show nearby Street View when imagery and the Maps key exist
ee5d092 2026-09-30T05:03:03Z feat(web): switch the market demo to World Cup Market blog stores
639460d 2026-09-30T18:34:21+09:00 chore(web): make World Cup Market preview standalone
2be6b5d 2026-09-30T18:38:46+09:00 chore(vercel): isolate project deployments
6200e12 2026-09-30T18:38:49+09:00 chore(vercel): enforce project/branch isolation

## 원본 23파일 diff stat

 .gitignore                                       |   1 +
 TASK.md                                          |  37 ++
 scripts/vercel-ignore.cjs                        |  18 +
 vercel.json                                      |   5 +-
 web/app/globals.css                              | 404 ++++++++++++++++++
 web/app/layout.tsx                               |   2 +
 web/app/page.tsx                                 | 513 +----------------------
 web/app/worldcup-market-mobile-overrides.css     | 414 ++++++++++++++++++
 web/app/worldcup-market-streetview.css           |  31 ++
 web/app/worldcup-market/page.tsx                 |  44 ++
 web/components/DestinationWalk.tsx               | 278 ++++++++++++
 web/components/WorldCupMarketDemo.test.tsx       | 126 ++++++
 web/components/WorldCupMarketDemo.tsx            | 465 ++++++++++++++++++++
 web/components/WorldCupMarketMap.tsx             | 163 +++++++
 web/components/WorldCupMarketStreetView.test.tsx |  57 +++
 web/components/WorldCupMarketStreetView.tsx      |  51 +++
 web/lib/i18n.ts                                  | 283 +++++++++++++
 web/lib/worldCupMarketStoreCopy.test.ts          |  39 ++
 web/lib/worldCupMarketStoreCopy.ts               |  52 +++
 web/lib/worldCupMarketStores.test.ts             |  71 ++++
 web/lib/worldCupMarketStores.ts                  | 274 ++++++++++++
 web/lib/worldCupMarketStreetView.test.ts         |  57 +++
 web/lib/worldCupMarketStreetView.ts              |  34 ++
 23 files changed, 2907 insertions(+), 512 deletions(-)
