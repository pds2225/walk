# Progress Notes — walk (Pedestrian Route Deviation Detection Engine)

> DONE.md E2/H6가 요구하는 필수 진행 기록 문서. (what was completed / out of scope / blockers / next milestone)

## 1. What was completed

### Milestone 1 — TypeScript 경로이탈 엔진 (`packages/route-engine/`)
- 타입 세트(Coordinate / PositionSample / TurnPoint / RouteModel / EngineConfig / EngineResult 등), geometry 유틸(거리·방향·heading 정규화·점-선분/점-polyline 최단거리), 경로 맥락 분석, 상태 판정 엔진(`on_route` / `drifting` / `deviated` / `passed_turn`), 추천 액션(`none` / `monitor` / `warn_user` / `reroute_candidate`), 상태 유지형 엔진, 4시나리오 시뮬레이터, 단위 테스트.
- 기본 임계값: drift 10m / deviation 15m / strong 25m / heading 45° / passByPostTurn 8m / turnApproach 12m / minConsecutive 3 / minDriftDuration 4000ms.
- 검증(2026-06-18 기준): `npm run test:run` 81 passed · `npm run typecheck` OK · `npm run lint` exit0 · `npm run simulate` exit0(4시나리오 상태전이 정확).

### Milestone 2 — Streamlit 로컬 웹 데모 (`streamlit_walk_engine/`)
- `app.py`: 시뮬레이터(시나리오 선택·단계 슬라이더·임계값 슬라이더·상태 색상 배지·샘플별 결과 테이블).
- `pages/1_Navigation.py`: 실시간 내비게이션(목적지 입력 → 경로 생성 → GPS 이탈 감지 → 한국어 TTS 음성 안내 → 도착 판정/안내 종료 → 재경로).
- `engine.py`: TypeScript 엔진의 Python 포팅 — 동일한 4상태/4액션, 동일 기본 임계값(8개 수치 일치), 완전한 타입 힌트(`any` 없음).
- `gps_filter.py`: GPS fix 사용성/정확도 게이트, 도착 판정(`is_arrival`), 재경로 워밍업 가드(`in_reroute_warmup`), 알림 레벨 결정.
- `alert_voice.py`: 이탈/도착 상태별 한국어 TTS 문구.
- 검증: `python -m pytest streamlit_walk_engine\tests -q` 116 passed.

## 2. What remains out of scope (PROMPT/DONE F3 기준)

원본 PROMPT.md / DONE.md F3가 범위 밖으로 명시한 항목:
- 모바일 앱 패키징, 백엔드 API 서버, 데이터베이스, 로그인/결제, 운영 배포 자동화, 관리자 페이지, Next.js 프론트엔드.

### 범위 확장 결정 기록 (거버넌스)
Milestone 2 이후 실시간 내비게이션 페이지(`streamlit_walk_engine/pages/1_Navigation.py`)가 추가되면서, 원본 PROMPT.md(L101–102 Out-of-Scope, 금지사항 #2) 및 DONE.md F3가 범위 밖으로 두었던 다음 기능이 **의도적으로 도입**되었다:
- (a) 브라우저 실시간 GPS(`streamlit_js_eval` get_geolocation),
- (b) 외부 보행 경로 API(TMAP / Valhalla — `route_builder.py`),
- (c) 외부 지오코딩 API(Naver / Nominatim).

이는 원본 Out-of-Scope 항목을 사용자 승인 하에 Milestone 2 범위로 확장한 결정이며, PROMPT.md L112가 "Streamlit 로컬 데모를 Milestone 2로 편입"한 선례와 동일한 성격이다. 키가 없거나 호출이 실패하면 OSM(Nominatim)·Valhalla 무료 폴백으로 자동 전환되어 데모는 키 없이도 동작한다. 비밀키는 환경변수·`st.secrets`·외부 마스터 `.env`로만 주입하며 로그/예외/UI에 노출하지 않는다.

## 3. Blockers encountered

- 현재 미해결 블로커 없음(no blockers). 검증 명령 4종(M1) + pytest(M2) 모두 통과.
- 운영상 참고(실사용 파괴 아님): Naver 지오코딩 키 오설정/쿼터초과 시 원인 안내 없이 Nominatim으로 조용히 폴백되는 관측성 갭, `.streamlit/secrets.toml.example`의 Naver 키 항목 누락(문서 갭). 기능 동작에는 영향 없음.

## 4. Next milestone recommendation

- 실시간 내비 페이지의 GPS·경로·도착·재경로 흐름은 브라우저 실측(모바일 포함) QA가 필요(현 단위테스트는 순수 함수만 커버). 실기기 검증 후 회귀 테스트 보강 권장.
- 임계값 슬라이더에 강한 이탈 거리(strong)·헤딩 임계 노출은 선택적 개선 항목으로 보류 중(현재 데모 동작에는 영향 없음).

---
_갱신: 2026-06-18 — UltraQA/Autopilot 요구사항·실사용 감사 결과 반영._
