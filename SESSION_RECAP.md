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
- `D:\walk\RESUME.md` — 현재 검증 결과와 다음 Gate만 갱신했다.
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
- `D:\walk\RESUME.md` — 다음 세션 재개 상태 갱신.
- `D:\walk\SESSION_RECAP.md` — 이번 세션 회고 누적.
- `D:\walk\.omc\wiki\walk-web-next-js-tmap-3.md` — runtime 검증 인사이트 누적.
- `C:\Users\ekth3\.claude\skills\omc-learned\preview-geolocation-runtime-gate.md` — 재사용 절차 저장.

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
- `D:\walk\RESUME.md` — 현재 검증 결과와 다음 Gate만 갱신했다.
- production code, UI, Street View metadata, env는 수정하지 않았다.

### ⏭️ 다음 할 일
- 실제 Chrome 브라우저 연결을 복구해 `permissions.query`와 raw Geolocation을 다시 확인한다.
- 위치 성공 후 route와 RoadviewViewer를 별도로 검증한다.
- Google Sheet 개발내역 작성·개발 가능성 검토는 이번 세션에서 실행하지 않았다.
