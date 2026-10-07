# walk 세션 회고

이 기록은 GitHub에서 공유한다. 경로는 저장소 루트 기준이며, 옛 회고의 로컬 위키/학습 스킬은 당시 PC에만 있던 기록이다. 다른 환경의 시작점은 [RESUME.md](RESUME.md), 통합 근거는 [공유 검증 기록](docs/session-evidence/2026-10-06-main-sync.md)이다. 과거 회고의 다음 할 일은 당시 상태이며 현재 우선순위는 origin/main:TASK.md를 따른다.

## 🧾 세션 회고 — 2026-10-06 (환경 간 공유)

- 전에는 회고와 재개 기록이 한 PC에만 있었고, 이제 저장소에서 함께 읽을 수 있도록 공유한다.
- 개인 설치 경로를 저장소 기준 경로로 바꾸고, 원래 PC의 임시 결과 파일 없이 확인할 수 있는 코드·GitHub 검사 링크를 연결했다.
- 기존 회고는 아래에 보존했고 원래 로컬 원본도 따로 보관했다. 앱 코드나 설정 값은 바꾸지 않았다.
- 새 환경에서는 RESUME의 clone/원격 읽기 절차로 최신 TASK와 공유 기록을 확인한다. 로컬 키 값·stash·개인 설정은 별도로 준비한다.

---

## 🧾 세션 회고 — 2026-10-06
**주제:** 시장 데모·길안내 개발 통합과 모든 작업 위치 동기화

### ✅ 한 일
- 전에는 월드컵시장·망원시장·길안내 개선이 여러 작업에 나뉘어 있었고, 이제 기존 네 언어 홈과 두 시장 기능을 하나의 최신 앱에 함께 반영했다.
- 전에는 월드컵시장 점포 위치와 거리 영상이 비어 있었고, 이제 블로그 근거를 유지한 45곳의 건물 좌표와 근처 거리 영상으로 지도·도보 안내를 사용할 수 있게 했다. 공유 건물 좌표는 임의로 흩뜨리지 않았다.
- 전에는 작업 폴더마다 개발 상태가 달랐고, 이제 확인된 12곳이 같은 최신 소스를 사용한다. 원래 개발 변경·개인 설정·기존 보관 작업은 보존했다.
- 필요한 영향 검사와 실제 휴대전화 크기 화면 확인을 마쳤고, 정식 자동 검사도 통과했다.
- 회고·재개 상태·위키를 저장하고 기존 재사용 절차를 보완했다. 내용 없는 자동 위키 기록은 외부 임시 보관 위치로 옮겨 원본을 보존했다.

### 🧭 정한 것
- 반복 검사는 줄이고 새 통합 영향만 확인한다. 필수 자동 검사는 생략하거나 약화하지 않는다.
- 실제 근거가 없는 위치·점포 정면을 추정하지 않는다. 공유 건물 좌표와 가까운 거리 영상을 개별 점포 출입구·실내 실측으로 보고하지 않는다.
- 이번 마무리에는 앱 코드 수정·추가 검사·배포·깃허브 변경을 하지 않는다.

### 📂 저장한 파일
- RESUME.md — 완료 상태와 다음 시작점.
- SESSION_RECAP.md — 기존 회고를 보존하고 이번 기록을 맨 위에 누적.
- .omc\wiki\walk-web-next-js-tmap-3.md — 현재 시장 영상 설정과 실사용 검증 범위 정정.
- .omc\wiki\walk-env-origin-ref-git-fetch-main-33-stale.md — 손상된 원격 참조와 작업 위치 확인 지식 누적.
- 로컬 학습 스킬 gsync-repo-check.md (저장소 외부) — 미반영 개발 보존·모든 위치 동기화·최소 검증 절차 보완.

### ⏭️ 다음 할 일
- 동기화 작업은 완료했으므로 다시 반복할 필요가 없다.
- 사용자가 원할 때 현장 점포 두 곳의 출입구·실제 휴대전화 위치·길안내·서비스 설정을 확인한다.

---

## 🧾 세션 회고 — 2026-09-16
**주제:** 망원시장 Preview의 실제 위치·Roadview 사용 가능성 점검

### ✅ 한 일
- 전에는 위치 실패가 앱 문제인지 환경 문제인지 분리되지 않았고, 이제 앱이 `getCurrentPosition`을 어떤 조건으로 호출하고 언제 navigation으로 넘어가는지 확인했다.
- Windows 위치 서비스와 시스템·사용자 위치 동의가 켜져 있음을 읽기 전용으로 확인했다.
- Preview에서 CTA를 다시 실행해 위치 오류가 처리되지만 화면이 깨지거나 JavaScript 오류가 발생하지 않는 것을 확인했다.
- 실제 위치와 합성 테스트 위치를 분리했고, 브라우저 연결이 사라져 raw Geolocation·합성 위치·RoadviewViewer까지는 검증하지 못했다.

### 🧭 정한 것
- 현재 판정은 실제 위치 성공이 아니라 `GEO-C / AUTOMATION LIMITATION`으로 유지한다.
- provider 설정 부족과 Geolocation 문제를 별도 blocker로 관리한다.

### 📂 손댄 파일
- `RESUME.md` — 현재 검증 결과와 다음 Gate만 갱신했다.
- production code, UI, Street View metadata, env는 수정하지 않았다.

### ⏭️ 다음 할 일
- 실제 Chrome 브라우저 연결을 복구해 `permissions.query`와 raw Geolocation을 다시 확인한다.
- 위치 성공 후 route와 RoadviewViewer를 별도로 검증한다.
- Google Sheet 개발내역 작성·개발 가능성 검토는 이번 세션에서 실행하지 않았다.
## 🧾 세션 회고 — 2026-09-17
**주제:** 망원시장 Preview runtime 검증 세션 마무리

### ✅ 한 일
- 전에는 실제 위치 실패와 자동화 도구 한계가 섞여 있었고, 이제 앱 호출 조건·Windows 위치 상태·브라우저 검증 한계를 분리해 기록했다.
- 다음에도 재사용할 수 있도록 실제 위치와 synthetic 위치를 분리하는 검증 절차를 스킬로 저장했다.
- 망원시장 웹의 TMAP route와 Roadview provider 설정을 별도 blocker로 확인하는 인사이트를 프로젝트 위키에 누적했다.
- 세션 회고와 재개 지점을 저장할 준비를 완료했다.

### 🧭 정한 것
- 실제 Geolocation 성공과 synthetic runtime 성공을 같은 결과로 보고하지 않는다.
- production code, UI, metadata, env, commit/push는 이번 마무리에서 변경하지 않는다.

### 📂 손댄 파일
- `RESUME.md` — 다음 세션 재개 상태 갱신.
- `SESSION_RECAP.md` — 이번 세션 회고 누적.
- `.omc\wiki\walk-web-next-js-tmap-3.md` — runtime 검증 인사이트 누적.
- `로컬 학습 스킬 preview-geolocation-runtime-gate.md (저장소 외부)` — 재사용 절차 저장.

### ⏭️ 다음 할 일
- 실제 Chrome 연결을 복구해 raw Geolocation을 확인한다.
- 위치 성공 후 route와 RoadviewViewer를 단계별로 검증한다.
- Google Sheet 개발내역 기록과 개발 가능성 검토는 별도 작업으로 남아 있다.

---

## 🧾 세션 회고 — 2026-09-16
**주제:** 망원시장 Preview의 실제 위치·Roadview 사용 가능성 점검

### ✅ 한 일
- 전에는 위치 실패가 앱 문제인지 환경 문제인지 분리되지 않았고, 이제 앱이 `getCurrentPosition`을 어떤 조건으로 호출하고 언제 navigation으로 넘어가는지 확인했다.
- Windows 위치 서비스와 시스템·사용자 위치 동의가 켜져 있음을 읽기 전용으로 확인했다.
- Preview에서 CTA를 다시 실행해 위치 오류가 처리되지만 화면이 깨지거나 JavaScript 오류가 발생하지 않는 것을 확인했다.
- 실제 위치와 합성 테스트 위치를 분리했고, 브라우저 연결이 사라져 raw Geolocation·합성 위치·RoadviewViewer까지는 검증하지 못했다.

### 🧭 정한 것
- 현재 판정은 실제 위치 성공이 아니라 `GEO-C / AUTOMATION LIMITATION`으로 유지한다.
- provider 설정 부족과 Geolocation 문제를 별도 blocker로 관리한다.

### 📂 손댄 파일
- `RESUME.md` — 현재 검증 결과와 다음 Gate만 갱신했다.
- production code, UI, Street View metadata, env는 수정하지 않았다.

### ⏭️ 다음 할 일
- 실제 Chrome 브라우저 연결을 복구해 `permissions.query`와 raw Geolocation을 다시 확인한다.
- 위치 성공 후 route와 RoadviewViewer를 별도로 검증한다.
- Google Sheet 개발내역 작성·개발 가능성 검토는 이번 세션에서 실행하지 않았다.
