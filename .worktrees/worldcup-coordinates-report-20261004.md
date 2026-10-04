# 월드컵시장 위치 보완 결과 — PR #143

확인일: 2026-10-04. 시작 head b8bfdfce264350a83b27248086c0c91411685d94. 일반 commit/push, draft 유지, main 병합/Ready/force push 없음.

좌표45/45, NAVER 근처 파노45/45(고유 ID13). 못 넣은 점포 없음. 블로그 본문17개/정보 이미지 실제픽셀28개 확인, Naver Geocoding 건물18개, 같은 좌표12그룹39점포. 파노와 건물 거리 최대29.08m, 모든 저장 파노50m이내. 점포 이름/ID/출처뿐 아니라 기존 stall 입력45개 전 필드가 시작head와 동일.

## 공유 좌표 (임의 분산 없음)

| 주소 | 점포 | 위도, 경도 |
|---|---|---|
| 서울특별시 마포구 망원로7길 31 | 부부야채, 삼해수산 | 37.5587334, 126.9050734 |
| 서울특별시 마포구 망원로7길 23 | 가락농산물, 동명식자재 | 37.5585682, 126.9051778 |
| 서울특별시 마포구 망원로7길 7 | 흥부건어물, 아부찌부대찌개, 경남장식, 쫑이네 야채 | 37.557926, 126.9054881 |
| 서울특별시 마포구 망원로7길 20 | 무진장전집, 거두식품, 어사또, 만물고추방앗간, 갱상도시래기, 장터국밥 | 37.5585035, 126.9055274 |
| 서울특별시 마포구 망원로7길 3 | 돌쇠떡고을, 소문난상회 | 37.557778, 126.9055477 |
| 서울특별시 마포구 망원로7길 4 | 충남수산, 곽가네기깔난게장 망원점 | 37.5577619, 126.9057674 |
| 서울특별시 마포구 망원로7길 13 | 패션타운, 윤아네, 무진장맛집, 미향이네, 월드컵신발, 강화풍물, 디자인데코, 성산야채, 한성커텐 | 37.558114, 126.9054151 |
| 서울특별시 마포구 망원로7길 24 한일주택 | 달인수제한방족발, 월드축산물 | 37.5586569, 126.9054136 |
| 서울특별시 마포구 망원로7길 17 지상빌딩 | 애기수산, 예그린식품 | 37.5582506, 126.9053372 |
| 서울특별시 마포구 월드컵로25길 35 | 명성족발, 수산킹, 대왕주단이불, 월드컵기름 | 37.5579801, 126.9057035 |
| 서울특별시 마포구 망원로7길 28 | 남도청과, 백년손님 형제떡방 | 37.5587974, 126.9053991 |
| 서울특별시 마포구 망원로 81 | 스마일청과, 재희네맛김 | 37.5576672, 126.9057937 |

## 검증

실행 위치: D:\walk\.worktrees\worldcup-market-clean-20261004\web. 기존 원본 D:\walk의 미커밋7파일은 별도 보존.

| 명령/확인 | 결과 |
|---|---|
| npm ci --include-workspace-root --include=dev --no-audit | PASS, 280packages, lockfile 변경 없음 |
| npm --prefix .. run lint | PASS |
| npm run build | PASS |
| npm --prefix .. run test:run | 20files,169tests PASS; 기본 병렬 실행, 검사/timeout 변경 없음 |
| npm --prefix .. run test:run -- --maxWorkers=2 | 동일한 20files,169tests PASS |
| npm --prefix .. run typecheck + npm run typecheck | root/web PASS |
| npm --prefix .. run simulate | normal/mild/strong/missed-turn 4시나리오 상태/행동 일치 PASS (출력 비교) |
| 실제 Chrome 390×844 | 두 점포 핀·도보·NAVER 영상·중지·홈4언어 PASS |
| 실제 TMAP route | 부부야채132m/7점, 장터국밥99m/5점, HTTP200 |
| 실제 지도 타일/파노 | 네트워크 mocking 없이 실제 응답·이미지 픽셀 확인; pageerror0 |
| 데이터/보호범위/Secret | 45입력 전 필드 동일; home/layout/globals/sharedroadview 유지; actuallocalkey소스 포함0 |

이전 고부하 기본 병렬 실행에서는 기존5초 제한을 넘긴 UI 테스트가 있었으나, 최종 기본 명령 재실행(12:13:29)은169개 모두 통과했다. 테스트 timeout이나 검사 내용을 완화하지 않았다.

## 남은 확인

- 건물 주소 지오코딩이며 개별 점포 입구/실내 실측은 미확인. 같은 좌표 마커 라벨은 겹칠 수 있어 점포 목록으로 선택한다.
- NAVER 영상은 점포 근처 사진이다. 정면/현재영업 여부를 확인했다고 주장하지 않으며 촬영일을 데이터에 기록했다.
- Chrome 위치는 출처 기반 좌표로 제어했다. 현장 휴대폰 GPS·실제 방문 및 배포 환경은 미검증.
- Google 키는 미설정. 실제 확인한 provider는 NAVER이고 Google Street View를 검증했다고 보고하지 않는다.
- 로컬 실행에는 TMAP_APP_KEY, NEXT_PUBLIC_NAVER_MAP_CLIENT_ID가 필요하다. 실제 키는 로컬env/프로세스에만 유지했다.

## 점포별 근거/위치

| ID | 점포 | 본문/이미지 | 주소 근거 | 좌표 | 근처 NAVER pano ID | 출처 |
|---|---|---|---|---|---|---|
| worldcup-market-01 | 부부야채 | BLOG_TEXT | 서울 마포구 망원로7길 31 | 37.5587334,126.9050734 | 4U8wQAvgbuNydJyDLXc4-w | [글](https://m.blog.naver.com/mwwdc/224412430654) |
| worldcup-market-02 | 가락농산물 | BLOG_TEXT | 📍 마포구 망원로7길 23 (08:00~21:00) | 37.5585682,126.9051778 | 2jTrCNGGMsrYG64u-FHqtg | [글](https://m.blog.naver.com/mwwdc/224412440846) |
| worldcup-market-03 | 흥부건어물 | BLOG_TEXT | 📍 마포구 망원로7길 7 (09:00~19:40) | 37.557926,126.9054881 | BYu-v3fBOtX0i15HKHtlGQ | [글](https://m.blog.naver.com/mwwdc/224412449101) |
| worldcup-market-04 | 무진장전집 | BLOG_TEXT | 서울 마포구 망원로7길 20 | 37.5585035,126.9055274 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224412451212) |
| worldcup-market-05 | 돌쇠떡고을 | BLOG_TEXT | 서울 마포구 망원로7길 3 1층 | 37.557778,126.9055477 | BYu-v3fBOtX0i15HKHtlGQ | [글](https://m.blog.naver.com/mwwdc/224412453183) |
| worldcup-market-06 | 금계옥수수 | BLOG_IMAGE | 서울 마포구 망원로7길 6 제1층 | 37.5578586,126.9057376 | WLdLFlA_dnHmmcS_pZGXdw | [글](https://m.blog.naver.com/mwwdc/224412457251) |
| worldcup-market-07 | 송가한우마을 | BLOG_IMAGE | 서울 마포구 망원로 79 1층 | 37.5576343,126.9055895 | MW-uZn3bADlGPfHP-0itpw | [글](https://m.blog.naver.com/mwwdc/224412460197) |
| worldcup-market-08 | 충남수산 | BLOG_IMAGE | 서울 마포구 망원로7길 4 | 37.5577619,126.9057674 | MfT4SrmyP_Xi8TptVt4JEg | [글](https://m.blog.naver.com/mwwdc/224412478736) |
| worldcup-market-09 | 패션타운 | BLOG_IMAGE | 서울 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224412482001) |
| worldcup-market-10 | 윤아네 | BLOG_IMAGE | 서울시 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224412557185) |
| worldcup-market-11 | 달인수제한방족발 | BLOG_IMAGE | 서울 마포구 망원로7길 24 | 37.5586569,126.9054136 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413698434) |
| worldcup-market-12 | 토종한우백화점 | BLOG_IMAGE | 서울 마포구 망원로7길 30 토종한우백화점 | 37.5588576,126.9052472 | N-DG5MgONI_v9FZlGjHxWA | [글](https://m.blog.naver.com/mwwdc/224413700679) |
| worldcup-market-13 | 무진장맛집 | BLOG_IMAGE | 서울시 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413711378) |
| worldcup-market-14 | 애기수산 | BLOG_IMAGE | 서울 마포구 망원로7길 17 102호 | 37.5582506,126.9053372 | C5uSl4uTuNQo81WK9kvrGA | [글](https://m.blog.naver.com/mwwdc/224413713111) |
| worldcup-market-15 | 명성족발 | BLOG_IMAGE | 서울특별시 마포구 월드컵로25길 35 | 37.5579801,126.9057035 | WLdLFlA_dnHmmcS_pZGXdw | [글](https://m.blog.naver.com/mwwdc/224413714916) |
| worldcup-market-16 | 아부찌부대찌개 | BLOG_TEXT | 서울 마포구 망원로7길 7, 1층 3호 | 37.557926,126.9054881 | BYu-v3fBOtX0i15HKHtlGQ | [글](https://m.blog.naver.com/mwwdc/224413716257) |
| worldcup-market-17 | 수산킹 | BLOG_TEXT | 서울 마포구 월드컵로25길 35 | 37.5579801,126.9057035 | WLdLFlA_dnHmmcS_pZGXdw | [글](https://m.blog.naver.com/mwwdc/224413717875) |
| worldcup-market-18 | 거두식품 | BLOG_TEXT | 서울 마포구 망원로7길 20 | 37.5585035,126.9055274 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413720695) |
| worldcup-market-19 | 미향이네 | BLOG_TEXT | 서울시 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413722923) |
| worldcup-market-20 | 월드컵신발 | BLOG_IMAGE | 서울시 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413724445) |
| worldcup-market-21 | 예그린식품 | BLOG_IMAGE | 서울 마포구 망원로7길 17 | 37.5582506,126.9053372 | C5uSl4uTuNQo81WK9kvrGA | [글](https://m.blog.naver.com/mwwdc/224413728095) |
| worldcup-market-22 | 동명식자재 | BLOG_TEXT | 서울 마포구 망원로7길 23 | 37.5585682,126.9051778 | 2jTrCNGGMsrYG64u-FHqtg | [글](https://m.blog.naver.com/mwwdc/224413730052) |
| worldcup-market-23 | 삼해수산 | BLOG_TEXT | 서울 마포구 망원로7길 31 (망원동월드컵시장) | 37.5587334,126.9050734 | 4U8wQAvgbuNydJyDLXc4-w | [글](https://m.blog.naver.com/mwwdc/224413731957) |
| worldcup-market-24 | 남도청과 | BLOG_TEXT | 서울 마포구 망원로7길 28 (망원동월드컵시장) | 37.5587974,126.9053991 | ZMH73kHMhpMHhsG8gdopfQ | [글](https://m.blog.naver.com/mwwdc/224413734092) |
| worldcup-market-25 | 월드축산물 | BLOG_TEXT | 서울 마포구 망원로7길 24 (망원동월드컵시장) | 37.5586569,126.9054136 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413754660) |
| worldcup-market-26 | 어사또 | BLOG_TEXT | 📍 서울 마포구 망원로7길 20 | 37.5585035,126.9055274 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413757089) |
| worldcup-market-27 | 다나와생활용품 망원점 | BLOG_TEXT | 📍 서울 마포구 망원로7길 19 | 37.5584128,126.9052835 | C5uSl4uTuNQo81WK9kvrGA | [글](https://m.blog.naver.com/mwwdc/224413759980) |
| worldcup-market-28 | 만물고추방앗간 | BLOG_TEXT | 📍 서울 마포구 망원로7길 20 | 37.5585035,126.9055274 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413770324) |
| worldcup-market-29 | 강화풍물 | BLOG_TEXT | 📍 서울 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413774926) |
| worldcup-market-30 | 반찬나라 | BLOG_IMAGE | 서울 마포구 월드컵로25길 33 1층 | 37.5580202,126.9058551 | CPsRuJqwgxIRRGy4wFav_Q | [글](https://m.blog.naver.com/mwwdc/224413776566) |
| worldcup-market-31 | 대왕주단이불 | BLOG_IMAGE | 서울 마포구 월드컵로25길 35 | 37.5579801,126.9057035 | WLdLFlA_dnHmmcS_pZGXdw | [글](https://m.blog.naver.com/mwwdc/224413778155) |
| worldcup-market-32 | 월드컵기름 | BLOG_IMAGE | 서울 마포구 월드컵로25길 35 | 37.5579801,126.9057035 | WLdLFlA_dnHmmcS_pZGXdw | [글](https://m.blog.naver.com/mwwdc/224413779906) |
| worldcup-market-33 | 디자인데코 | BLOG_IMAGE | 서울 마포구 망원로7길 13 1층 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413782369) |
| worldcup-market-34 | 경남장식 | BLOG_IMAGE | 서울 마포구 망원로7길 7 | 37.557926,126.9054881 | BYu-v3fBOtX0i15HKHtlGQ | [글](https://m.blog.naver.com/mwwdc/224413783734) |
| worldcup-market-35 | 쫑이네 야채 | BLOG_IMAGE | 서울 마포구 망원로7길 7 | 37.557926,126.9054881 | BYu-v3fBOtX0i15HKHtlGQ | [글](https://m.blog.naver.com/mwwdc/224413788865) |
| worldcup-market-36 | 우리축산 | BLOG_IMAGE | 서울 마포구 망원로 82 | 37.5574056,126.9058836 | 1Fb6a-cXtlbkn8gaPF9syw | [글](https://m.blog.naver.com/mwwdc/224413794826) |
| worldcup-market-37 | 소문난상회 | BLOG_IMAGE | 서울 마포구 망원로7길 3 | 37.557778,126.9055477 | BYu-v3fBOtX0i15HKHtlGQ | [글](https://m.blog.naver.com/mwwdc/224413796680) |
| worldcup-market-38 | 곽가네기깔난게장 망원점 | BLOG_IMAGE | 서울 마포구 망원로7길 4 1층 | 37.5577619,126.9057674 | MfT4SrmyP_Xi8TptVt4JEg | [글](https://m.blog.naver.com/mwwdc/224413864625) |
| worldcup-market-39 | 스마일청과 | BLOG_IMAGE | 서울 마포구 망원로 81 | 37.5576672,126.9057937 | MfT4SrmyP_Xi8TptVt4JEg | [글](https://m.blog.naver.com/mwwdc/224413866627) |
| worldcup-market-40 | 재희네맛김 | BLOG_IMAGE | 서울 마포구 망원로 81 1층 | 37.5576672,126.9057937 | MfT4SrmyP_Xi8TptVt4JEg | [글](https://m.blog.naver.com/mwwdc/224413868244) |
| worldcup-market-41 | 성산야채 | BLOG_IMAGE | 서울 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413870618) |
| worldcup-market-42 | 백년손님 형제떡방 | BLOG_IMAGE | 서울 마포구 망원로7길 28 | 37.5587974,126.9053991 | ZMH73kHMhpMHhsG8gdopfQ | [글](https://m.blog.naver.com/mwwdc/224413877020) |
| worldcup-market-43 | 갱상도시래기 | BLOG_IMAGE | 서울 마포구 망원로7길 20 1층 | 37.5585035,126.9055274 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413879128) |
| worldcup-market-44 | 한성커텐 | BLOG_IMAGE | 서울 마포구 망원로7길 13 | 37.558114,126.9054151 | 3f3KPu_qhVgGI2X4FcHAJg | [글](https://m.blog.naver.com/mwwdc/224413880510) |
| worldcup-market-45 | 장터국밥 | BLOG_IMAGE | 서울 마포구 망원로7길 20 | 37.5585035,126.9055274 | 9o7TkEzuO39eET_lHz6YIQ | [글](https://m.blog.naver.com/mwwdc/224413884748) |
