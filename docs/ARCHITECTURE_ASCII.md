# walk 레포 전체 아키텍처 (ASCII)

> 2026-07-22 기준, `main` 코드 실측 분석. 함수명·설정값은 전부 실제 코드에서 추출.

```text
═══════════════════════════════════════════════════════════════════════════════
 0. 전체 조감도 — 모노레포 구성
═══════════════════════════════════════════════════════════════════════════════

 D:\walk  (npm 모노레포 + Python 앱 2개)
 │
 ├─ packages/route-engine/        [A] 경로이탈 판정 엔진 (TypeScript, 원본)
 │    └ src/{config,domain,engine,geometry,simulator,types}  + tests(81개)
 │
 ├─ streamlit_walk_engine/        [B] 도보 내비게이션 앱 (Python, 실서비스)
 │    ├ engine.py                 ← [A]를 1:1 포팅한 판정 엔진
 │    ├ pages/1_Navigation.py     ← 실전 내비 화면 (3,632줄, 심장부)
 │    ├ route_builder.py          ← 지오코딩 + 도보 경로 API (TMAP/Valhalla)
 │    ├ transit_builder.py        ← 대중교통 여정 (TMAP/ODsay)
 │    ├ gps_filter.py             ← GPS 노이즈 필터·알림 게이팅 (순수함수)
 │    ├ snap_router.py            ← 무료 이탈 확정/거부 층 (진행도 기반)
 │    ├ mapbox_matcher.py         ← 유료 도로망 확인 층 (Map Matching)
 │    ├ nav_session.py            ← 세션 복원/폴링 판정 (순수함수)
 │    ├ alert_voice.py            ← TTS 문구·JS 생성 (순수함수)
 │    ├ maplibre_nav_component.py + components/maplibre_nav/index.html
 │    │                            ← 부드러운 헤딩업 지도 (커스텀 컴포넌트)
 │    ├ walk_diag.py / ux_audit.py← 진단 로그 / UX 자동감사
 │    ├ app.py + scenarios.py     ← 시뮬레이터 데모 화면
 │    └ tests(124개)
 │
 ├─ streamlit_task_organizer/     [C] 텍스트→할일 정리 앱 (Python, 별도 서비스)
 │    ├ app.py                    ← UI (입력→파싱→편집→내보내기)
 │    ├ parser/ (8모듈)           ← 규칙 기반 파싱 파이프라인
 │    ├ schemas/ services/ utils/ + tests(20개)
 │
 ├─ apps/api/                     빈 스캐폴드 (app/, tests/ 폴더만 존재)
 ├─ .worktrees/ (28개)            병렬 개발용 git worktree들
 ├─ docs/, *.md                   PLAN/RUNBOOK/TASKS 등 운영 문서
 └─ package.json / requirements.txt / tsconfig / eslint.config.js

 실행 명령 (package.json scripts)
 ┌────────────────┬──────────────────────────────────────────────┐
 │ npm run        │ 동작                                          │
 ├────────────────┼──────────────────────────────────────────────┤
 │ test / test:run│ vitest (TS 엔진 테스트)                       │
 │ typecheck      │ tsc --noEmit                                  │
 │ lint           │ eslint .                                      │
 │ simulate       │ tsx .../simulator/runSimulator.ts             │
 │ web:install    │ python streamlit_walk_engine/install_requirements.py │
 │ web:demo       │ python streamlit_walk_engine/run_demo.py → :8501     │
 └────────────────┴──────────────────────────────────────────────┘
 파이썬 의존성: streamlit 1.54 / plotly / pydeck / pandas / requests
               streamlit-js-eval / streamlit-autorefresh / gTTS


═══════════════════════════════════════════════════════════════════════════════
 [A] route-engine — 경로이탈 판정 엔진 (TS 원본 = engine.py 포팅본과 동일 로직)
═══════════════════════════════════════════════════════════════════════════════

 입력 모델 (types/models.ts = engine.py dataclass)
   RouteModel  = polyline: Coordinate[]  +  turnPoints: TurnPoint[]
   TurnPoint   = {id, coordinate, routeIndex, direction: left|right|straight}
   PositionSample = {lat, lon, headingDegrees, speedMps, timestampMs}

 기본 설정값 DEFAULT_WALKING_ENGINE_CONFIG (walkingConfig.ts = EngineConfig)
 ┌──────────────────────────────────────────────┬────────┐
 │ routeDriftDistanceThresholdMeters   (주의)    │ 10 m   │
 │ routeDeviationDistanceThresholdMeters (확정)  │ 15 m   │
 │ strongDeviationDistanceThresholdMeters (강한) │ 25 m   │
 │ headingDifferenceThresholdDegrees             │ 45°    │
 │ passByPostTurnDistanceThresholdMeters         │ 8 m    │
 │ turnApproachDistanceThresholdMeters           │ 12 m   │
 │ minimumConsecutiveSamplesForDeviation         │ 3 회   │
 │ minimumDriftDurationMs                        │ 4000ms │
 └──────────────────────────────────────────────┴────────┘
 validateEngineConfig: 전부 양수 + drift ≤ deviation ≤ strong 검증(위반 시 RangeError)

 생성 시 1회: prepareRouteModel(route)
   ├ deriveSegmentHeadings()      각 구간 방위각 (bearingDegrees)
   ├ deriveSegmentLengths()       각 구간 길이 (haversine distanceMeters)
   ├ deriveCumulativeDistances()  누적 거리 테이블
   └ turnPoints 정렬+검증 → PreparedTurnPoint
        {approachHeading(직전 구간), exitHeading(직후 구간), distanceAlongRoute}

 매 GPS 표본: RouteDeviationEngine.processSample(sample)
                └→ evaluateDeviationStep()   ※ 세션상태(EngineSessionState)와 함께
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ ① 최근접 구간 찾기  findNearestRouteSegment                              │
 │     projectPointToPolylineMeters: 모든 구간에 점 투영(로컬 ENU 근사)      │
 │     → {segmentIndex, distanceMeters(횡거리 d), along(진행도)}            │
 │ ② 방향 차이  headingDiff = angularDifference(내 heading, 구간 방위)      │
 │ ③ 다음 회전점  getNextTurnPoint(along, 허용오차 3m)                      │
 │     거리 ≤ 12m 진입 → activeApproachTurnId 잠금(회전 감시 시작)          │
 │ ④ 임계 플래그                                                            │
 │     driftBreach     = d ≥ 10                                            │
 │     deviationBreach = d ≥ 15                                            │
 │     strongBreach    = d ≥ 25                                            │
 │     headingConflict = headingDiff ≥ 45°                                 │
 │     thresholdBreach = driftBreach OR (headingConflict AND d ≥ 6(=10×0.6))│
 │ ⑤ 지속성 카운터 (세션상태)                                               │
 │     breach면 consecutive+1, driftStart 기록 → driftDurationMs 누적       │
 │     breach 아니면 전부 0/리셋                                            │
 │ ⑥ 회전 감시 중(activeTurn 있음)이면                                      │
 │     postTurnDiff = angularDiff(내 heading, exitHeading)                 │
 │     정상회전 해제: postTurnDiff < 22.5°(=45/2) AND d < 10               │
 │                    AND 현재구간 ≥ 회전구간  → 잠금 해제                   │
 │     회전 지나침:  approach 방향으로 회전점 지나 ≥ 8m                     │
 │                    AND postTurnDiff ≥ 45° AND d ≥ 7(=10×0.7) → passed   │
 │     되돌아옴 복구: 회전점 이전 구간 + d < 10 → 잠금 해제(passed 취소)    │
 │ ⑦ 상태 결정 (우선순위)                                                   │
 │     deviated = ¬passed AND (consecutive ≥ 3 OR duration ≥ 4000ms)       │
 │                AND (deviationBreach OR strongBreach                     │
 │                     OR (driftBreach AND headingConflict))               │
 │     state:  passed_turn > deviated > drifting(=breach만) > on_route     │
 │ ⑧ 점수  score = 0.45·(d/25) + 0.2·(hdiff/180)                           │
 │                + 0.2·(consec/3) + 0.15·(dur/4000)   [각 항 0~1 클램프]  │
 │     보정: passed≥0.95 / deviated≥0.75 / drifting≥0.4 / on_route≤0.25   │
 │ ⑨ 추천 행동 resolveSuggestedAction                                       │
 │     on_route→none, drifting→monitor                                     │
 │     deviated→ (strongBreach OR score≥0.85) ? reroute_candidate          │
 │                                             : warn_user                 │
 │     passed_turn→reroute_candidate                                       │
 └─────────────────────────────────────────────────────────────────────────┘
 출력 EngineResult = {state, score, reasons[], metrics(13종), suggestedNextAction}

 상태 머신
                d≥10 (또는 방향상충+d≥6)          지속(3회/4초)+d≥15
   [on_route] ────────────────────────▶ [drifting] ─────────────▶ [deviated]
        ▲  d<10 복귀(카운터 리셋)           │                        │
        └──────────────────────────────────┴────────────────────────┘
   회전점 12m 접근(잠금) → 8m 지나침+방향상충+이탈 → [passed_turn]
   (backtrack 시 잠금 해제로 복구)

 시뮬레이터 (simulator/): 시나리오 4종(정상보행/약한이탈/강한이탈/회전통과)
   runSimulator.ts → 표본별 state·action·score·거리·방향차 콘솔 출력
   기준점 ORIGIN = 서울시청 (37.5665, 126.978)


═══════════════════════════════════════════════════════════════════════════════
 [B] streamlit_walk_engine — 도보 내비게이션 (실서비스 파이프라인)
═══════════════════════════════════════════════════════════════════════════════

 B-1. 계층 구조 (브라우저 ↔ 서버 rerun 루프)

  ┌─────────────────────── 브라우저(폰) ────────────────────────────┐
  │  Geolocation API        DeviceOrientation      localStorage     │
  │  (enableHighAccuracy)   (나침반, iOS/abs/plain) (즐겨찾기·세션·  │
  │  streamlit-js-eval로    원형평균 0.8s 스무딩     최근위치·진단)   │
  │  주입한 JS Promise      자북→진북 -8.5° 보정                     │
  │                                                                 │
  │  MapLibre iframe(컴포넌트, rerun에도 재마운트 없음)              │
  │   ├ Carto voyager 스타일(토큰 불필요), easeTo 900ms 헤딩업       │
  │   ├ 핀치줌 유지 계약(easeTo에 zoom 미포함)                       │
  │   └ 사용자 터치 후 2.5s(USER_GRACE_MS) 카메라 추적 일시정지      │
  │  st.audio(WAV 비프) + SpeechSynthesis/gTTS(TTS) + vibrate      │
  └───────────────▲────────────────────────────┬────────────────────┘
                  │ 렌더/JS 주입                │ GPS·나침반 값, LS 값
  ┌───────────────┴────────────────────────────▼────────────────────┐
  │        Streamlit 서버 — 1_Navigation.py main() (매 rerun 재실행) │
  │        st_autorefresh: 안내중 1s / 위치미확보 5s / 예약대기 10s   │
  │        session_state 약 50키(nav_*) + gps_filter 모듈전역        │
  │        (PENDING_REROUTE — rerun을 건너 살아남는 유일한 저장소)    │
  └───────────────┬─────────────────────────────────────────────────┘
                  │ HTTPS (_TIMEOUT=8s)
  ┌───────────────▼─────────────────────────────────────────────────┐
  │ 외부 API (키: 환경변수 → st.secrets → D:\_secure\.env.shared)    │
  │  · TMAP 보행자경로/POI/주소/역지오코딩/대중교통 (TMAP_APP_KEY)   │
  │  · Naver 지오코딩·역지오코딩(NCP) + 지역검색(개발자센터, 별도키)  │
  │  · Valhalla(OSM, 무키) · Nominatim(무키) · ODsay(ODSAY_API_KEY) │
  │  · Mapbox Map Matching(MAPBOX_TOKEN, 없으면 휴면)               │
  │  · GitHub API(진단로그 업로드, walk-diag-logs 브랜치)            │
  └─────────────────────────────────────────────────────────────────┘

 B-2. 경로 만들기 — route_builder.py

  검색어 자동완성 geocode_suggestions(query, limit=5, center=현재위치)
   ├ 좌표 리터럴 "37.5, 127.0" 이면 즉시 반환 (한국 범위 33~39/124~132 검증)
   ├ ThreadPoolExecutor(4)로 4소스 동시 호출:
   │    ① _naver_local_hits   네이버 지역검색(상호·POI, mapx/1e7)
   │    ② _naver_suggestion_hits 네이버 지오코딩(주소, '서판로30'→'서판로 30' 변형)
   │    ③ _tmap_addr_results  TMAP fullAddrGeo(주소)
   │    ④ _tmap_poi_results   TMAP POI(center 있으면 거리순 R+radius=0,
   │                           비면 정확도순 A 재시도)
   ├ 병합 우선순위: ①local → (②naver 있으면 ②, 없으면 ③addr) → ④poi
   ├ 전부 비면: Nominatim 폴백(지하철 표기 변형 _subway_candidates
   │            '강남역 10번출구'→8가지 변형)
   └ 중복 제거: 좌표 6자리 동일 제거 + 같은 라벨이 60m(_DEDUP_NEAR_M) 이내면 합침
  확정 지오코딩 geocode_address: 리터럴→Naver→TMAP주소→네이버지역→TMAP POI→Nominatim
  역지오코딩 reverse_geocode: Naver → TMAP → Nominatim (한국식 표기 정규화
    format_korean_address: 우편번호 앞괄호, 국가 숨김, 광역→세부 재배열)

  도보 경로 fetch_walking_route_with_engine(origin, dest)
   ├ TMAP_APP_KEY 있으면: POST /tmap/routes/pedestrian (searchOption=0 추천)
   │    _route_from_tmap_features:
   │      LineString 이어붙여 polyline(중복좌표 제거)
   │      Point turnType ∈ {12,16,17}=left / {13,18,19}=right → TurnPoint
   │      totalDistance/totalTime + 회전 안내문(description) → RouteInfo
   ├ 실패/무키: Valhalla pedestrian (polyline6 디코딩,
   │      maneuver type {4,5,6}=right / {8,9,10}=left)
   └ ETA 없으면 estimate_walking_seconds: 시속 4km(WALKING_SPEED_KMH) 추정

 B-3. 대중교통 여정 — transit_builder.py

  fetch_transit_journey(origin, dest)   ※ 예외는 UI로 절대 전파 안 함
   ├ ① TMAP transit (POST /transit/routes) → parse_tmap_transit
   ├ ② 실패 시 ODsay searchPubTransPathT → parse_odsay_transit
   │      (도보구간 좌표 없음 → 인접 대중교통 구간·여정 양끝에서 보간)
   ├ ③ 둘 다 실패/무키 → build_walking_only_journey
   │      source = "도보 강등(키 없음)" 또는 "도보 강등(대중교통 경로 실패)"
   └ _hydrate_walk_legs: walk 레그마다 도보경로 API 재호출 → tracked=True
        (지하철/버스 레그는 GPS 불신 → 카드 표시만, 이탈감지 없음)
  Journey = legs[  JourneyLeg{mode: walk|subway|bus|transfer, tracked,
                              route, route_info, transit(TransitInfo)} ]
  레그 전환 advance_leg: walk+tracked 레그가 끝점 도착판정(is_arrival)시 +1
                         (transit 레그는 절대 자동 전환 안 함)

 B-4. 안내 중 1틱(rerun) 파이프라인 — main() 실행 순서 그대로

  st_autorefresh(1s) ──▶ ┌─ rerun 시작 ─────────────────────────────────┐
                         │ ① _init(세션 50키) + LS 복원                  │
                         │    _load_history_from_ls / _restore_last_fix  │
                         │    _restore_active_session(6h 만료 검사)      │
                         │ ② _commit_pending_reroute ◀── 백그라운드 스레드│
                         │    (재탐색 결과를 rerun 시작부에서 커밋)       │
                         │ ③ 검색히스토리 클릭/자동재개(resume) 처리      │
                         │    nav_session.resume_action → go/cancel/wait │
                         │ ④ CSS 디자인토큰 + 목적지 입력/설정 UI        │
                         │    슬라이더 → EngineConfig(drift 5~20 기본10, │
                         │    확정 drift~25 기본 max(15,drift),          │
                         │    연속 1~5 기본3, 지속시간 고정 2000ms)      │
                         └──────────────┬────────────────────────────────┘
                                        ▼
  ⑤ GPS 폴링 (nav_session.gps_poll_needed가 True일 때만)
     │  · 목적지 입력 중(dest_entry_active)+위치 이미 있음 → 폴링 정지
     │  · 첫 fix: multi 측정(watchPosition, ≤20m or 4fix 즉시,
     │            soft 2.5s / hard 6s 마감) / 라이브: 단일(maximumAge=1000)
     │  · 나침반값 동승 → -8.5°(_COMPASS_DECL_DEG) 편각 보정
     ▼
  ⑥ GPS 필터 체인 (gps_filter.py 순수함수들)
     ┌────────────────────────────────────────────────────────────────┐
     │ nav_gating_acc = 매 응답 갱신(수용/기각 무관 — 게이팅용)         │
     │ is_fix_usable:  accuracy > 50m(USABLE) → 이 fix 버림            │
     │ should_skip_duplicate_fix: timestamp 동일(캐시 재전달) → 틱 skip │
     │ is_plausible_step (점프 가드):                                  │
     │   허용 = 3.0m/s × max(경과,1s) + acc신+acc구 + 10m 마진         │
     │   초과 → 기각(+streak).  탈출: streak≥3 or 경과≥60s → 강제수용   │
     │   IP/캐시 부트스트랩 좌표가 앵커면 가드 skip(첫 실측이 이김)      │
     │ 수용 시 이원화:                                                 │
     │   nav_origin(판정용) = raw fix 그대로                           │
     │   nav_display_origin(표시용) =                                  │
     │     이동≥8m(SKIP_MOVE) → raw + 버퍼 리셋                        │
     │     정지(최근5 fix 순변위<2.5m, ≥3fix) → median_position        │
     │     그 외 → accuracy_weighted_blend(정확한 쪽 가중)             │
     │ 실패 시: IP 폴백(coarse) → 수동 입력 유도                       │
     │ 100m 이상 이동 시 마지막 위치 LS 캐시(_save_last_fix)           │
     └────────────────────────────────────────────────────────────────┘
     ▼
  ⑦ 도착·레그 전환 (이탈 판정보다 먼저)
     advance_leg(여정) / _maybe_finish_arrival:
       is_arrival = 목적지 ≤ 20m(ARRIVAL_RADIUS) AND acc ≤ 35m(FAIR)
       → 요약("소요 N분·재탐색 N회") + 진단로그 LS/GitHub 업로드 + 종료
     ▼
  ⑧ 엔진 판정 (직전 좌표에서 1m 초과 이동 시에만 새 표본)
     _make_sample:
       heading/speed = sanitize_motion(GPS값 신뢰구간 [0.5, 7.0]m/s면 GPS,
                       아니면 직전좌표 파생값, 둘 다 없으면 (0, 1.4), 상한 3.0)
     표본 간격 > 30s(_GPS_GAP_RESET_MS) → 엔진 재생성(이력 리셋)
     engine.process_sample → results/samples 누적 (상한 _MAX_SAMPLES=500)
     smooth_heading: 최근 5개 가중 원형평균 → 지도 헤딩업·화살표 안정화
     _diag("tick", ...) 진단 기록 (상한 DIAG_CAP=3000 ≈ 50분)
     ▼
  ⑨ 알림 결정 (gps_filter)
     alert_level(acc, state):
       acc≤15m(게이트) → full / acc>15 + deviated·passed_turn → weak
       acc>15 + on_route·drifting → mute (의도: 오탐 억제)
     decide_alert: 상태 전이(state≠last_alerted) 시에만 발화,
       weak는 15s(WEAK_TOAST_COOLDOWN) 쿨다운, mute는 last 미갱신
     full 발화 → _trigger_alert: 비프 WAV(_ALERT 주파수표: drifting 660Hz 1회
       /deviated 880+660 2회/passed 880 3회/arrived 도레미 3음)
       + navigator.vibrate 패턴 + st.toast + TTS 문구(alert_voice._TTS_PHRASES)
     ▼
  ⑩ 회전 예고 _maybe_announce_turn (회전점당 1회, TTS)
     발화 거리 announce_distance_m: 기본 10m,
       acc 15~35m → +0.5×(acc-15) 최대 +10, acc>35m → 20m 고정
     문구: "잠시 후 좌회전/우회전입니다" (TMAP description 있으면 그것)
     ▼
  ⑪ 재탐색 판단 (state ∈ {deviated, passed_turn} AND 재탐색 on AND 목적지 有)
     ┌────────────────────────────────────────────────────────────────┐
     │ 1층: 워밍업  in_reroute_warmup: 표본<5 AND 경과<30s → 금지      │
     │ 2층: 쿨다운  3s(_REROUTE_COOLDOWN_MS, fetch '이전'에 선기록)    │
     │ 3층: _reroute_suppressed — 3단 판정 결합                        │
     │   ⓐ snap_router.classify (무료, 윈도 6표본):                    │
     │      STATIONARY(경로합≥3m·방향성<0.6)      → 억제(제자리 흔들림)│
     │      OFF_ROUTE_CONFIRMED(진행정체 along≤1m  → 허용(진짜 이탈)   │
     │        +횡거리≥18m+직전≥12.6m+순변위≥4m+acc≤30)                │
     │      ON_ROUTE_LIKELY(전진≥4m+코리도어<40m) → ⓑ로               │
     │      DEFER(스냅점프 |along|>순변위×2+8m 등) → ⓑ로              │
     │      ※ passed_turn은 ⓐ 억제 대상 아님(정지 보호만)             │
     │   ⓑ mapbox_matcher.confirm_deviation (유료, 토큰 있을 때만):    │
     │      최근 궤적(4~25점, 반경 25m)을 도로망 스냅, 신뢰도≥0.30     │
     │      스냅 최신점이 계획경로에서 >20m → True(허용)               │
     │      ≤20m → False(억제+쿨다운 재기록) / 실패 → None            │
     │   ⓒ 무료 폴백: acc>35m → 억제 /                                │
     │      ON_ROUTE_LIKELY 억제 지속 + 횡거리≥18m가 90s               │
     │      (_SNAP_SUPPRESS_MAX_MS) 넘으면 1회 허용(평행도로 구제)     │
     │ 통과 → _start_reroute_fetch: 백그라운드 스레드로 경로 API 호출  │
     │   결과는 gps_filter.PENDING_REROUTE[세션id]에 저장(락 보호)     │
     │   ※ 동기 fetch 금지 — 1s autorefresh가 실행을 끊으면 커밋 유실  │
     │   → 다음 rerun ②(_commit_pending_reroute)에서 경로·엔진 교체    │
     └────────────────────────────────────────────────────────────────┘
     ▼
  ⑫ _flush_audio — rerun당 오디오 1개만 재생 (모바일 autoplay 제한)
     우선순위: arrived 100 > deviated·passed_turn 80 > 재탐색성공 70
               > drifting 60 > 회전예고 40
     TTS는 gTTS mp3 캐시(_tts_mp3_cached) → st.audio autoplay
     ▼
  ⑬ Wake Lock(_apply_wake_lock) + 안내세션 LS 저장(_save_active_session,
     서명 스로틀 / 만료 6h / ts 갱신 30min 간격)
     ▼
  ⑭ 지도 렌더 (우선순위 폴백)
     안내 중: MapLibre 컴포넌트(1순위) → pydeck 헤딩업(2순위, _DECK_ZOOM=17)
     유휴/도착: plotly(_build_map, uirevision으로 카메라 보존)
     경로 없음: _build_placeholder_map(서울시청 기본 _DEFAULT_CENTER)
     + 판정 패널(_render_metrics: 상태·다음회전 배지·거리·ETA)
     + 진단 패널(_render_diag_panel) → 끝에 _flush_audio 재확인

 B-5. 세션 영속화·복원 (localStorage 키)
   walk_navi_favorites / 검색·예약 히스토리 / walk_navi_last_fix(재방문 부트스트랩)
   walk_navi_active(안내세션: lat/lon/label/transit/ts)
     → 새로고침·폰잠금 복귀 시 nav_session.classify_saved_session:
        JSON 손상→"bad"(키 삭제) / 6h 초과→"expired" / 유효→"resume"
     → resume_action: 사용자가 새 목적지 조작 중이면 cancel /
        위치 잡히면 go(재계획+start_now) / 아니면 wait(다음 rerun 재시도,
        실패 시 _RESUME_MAX_ATTEMPTS=3회까지)
   경로 예약(bookings): 출발반경 진입 감지 → 자동 활성화(_try_activate_booking)

 B-6. 설정값 총표 (Python 쪽 고유값)
 ┌─────────────────────────────────┬──────────┬───────────────────────────┐
 │ 상수                             │ 값       │ 의미                       │
 ├─────────────────────────────────┼──────────┼───────────────────────────┤
 │ GOOD/FAIR_ACCURACY_M            │ 15/35 m  │ 정확도 배지 경계(🟢🟡🔴)   │
 │ ALERT_ACCURACY_GATE_M           │ 15 m     │ 알림 억제 시작 경계        │
 │ USABLE_ACCURACY_M               │ 50 m     │ fix 채택 한계              │
 │ ARRIVAL_RADIUS_M                │ 20 m     │ 도착 반경                  │
 │ WEAK_TOAST_COOLDOWN_MS          │ 15,000   │ weak 토스트 쿨다운         │
 │ REROUTE_WARMUP (샘플/시간)       │ 5 / 30s  │ 시작 직후 재탐색 금지      │
 │ _REROUTE_COOLDOWN_MS            │ 3,000    │ 재탐색 최소 간격           │
 │ _GPS_GAP_RESET_MS               │ 30,000   │ 공백 후 엔진 리셋          │
 │ _FIX_STALE_MS                   │ 15,000   │ "N초 전 위치" 신선도 표시  │
 │ WALK_MAX_SPEED_MPS              │ 3.0      │ 점프 판정용 보행 상한      │
 │ JUMP margin/streak/escape       │ 10m/3/60s│ 점프 가드 파라미터         │
 │ MOTION 신뢰구간/기본/상한        │0.5~7/1.4/3│ heading·speed 위생        │
 │ HEADING_SMOOTH_WINDOW           │ 5        │ 방향 원형평균 창           │
 │ SMOOTH window/skip/net/min      │5/8m/2.5m/3│ 표시 스무딩 파라미터      │
 │ 회전예고 기본/상한               │ 10/20 m  │ announce_distance_m       │
 │ _MAX_SAMPLES                    │ 500      │ 표본·판정 누적 상한        │
 │ _COMPASS_DECL_DEG               │ -8.5°    │ 자북→진북 편각(남한)       │
 │ _SNAP_WINDOW / SUPPRESS_MAX     │ 6 / 90s  │ 진행도 윈도/억제 상한      │
 │ snap: CORRIDOR/OFFSET/ADVANCE   │40/18/4 m │ 진행도 판정 임계           │
 │ mapbox: 점수/반경/확정/타임아웃  │.30/25/20m/4s│ 매칭 파라미터           │
 │ UI 오버라이드 drift_duration     │ 2,000 ms │ 4s→2s (빠른 확정)         │
 │ autorefresh                     │1/5/10 s  │ 안내/위치대기/예약대기     │
 │ 세션 만료/ts갱신/재시도          │6h/30m/3회│ 안내세션 영속화            │
 │ _LASTFIX_SAVE_MOVE_M            │ 100 m    │ 위치캐시 저장 스로틀       │
 │ DIAG_CAP                        │ 3,000    │ 진단로그 상한(≈50분)       │
 │ _TIMEOUT (외부 API)             │ 8 s      │ requests 타임아웃          │
 │ WALKING_SPEED_KMH               │ 4.0      │ ETA 추정 보행속도          │
 └─────────────────────────────────┴──────────┴───────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════
 [C] streamlit_task_organizer — 텍스트 기반 할일 정리 (규칙 기반, LLM 없음)
═══════════════════════════════════════════════════════════════════════════════

  app.py main()
   render_header → render_input_section(직접입력/샘플 3종)
     → handle_parse_action ──▶ parser/orchestrator.parse_task_text(text, 기준일)
                                 │
   ┌─────────────────────────────▼──────────────────────────────────┐
   │ ① clean_text          공백·특수문자 정리                        │
   │ ② classify_category   키워드 가중치표(CATEGORY_KEYWORDS)로      │
   │      분류: 보완요청/제출요청/납부요청/방문·예약/일반안내         │
   │ ③ extract_due_date    "5월 3일까지", "D-3" 등 → 날짜+신뢰도     │
   │ ④ extract_contacts    이메일·전화 + 제출방법(메일/업로드/방문/  │
   │      문자회신/전화/납부/예약/기타/미추출)                       │
   │ ⑤ extract_checklist   헤더(보완서류/제출서류/준비물/필수서류/   │
   │      첨부서류/준비 항목) 아래 목록 + 조건문                     │
   │ ⑥ _extract_organization 대괄호제목(0.86) → 상단4줄(0.80)       │
   │      → "안녕하세요 ~입니다"(0.72)                              │
   │ ⑦ _build_task_summary  카테고리×제출방법 → 요약문               │
   │ ⑧ build_title / ⑨ build_memo                                   │
   │ 출력: ParsedTaskResult{title, due_date, task_summary, category, │
   │   organization, memo, contacts, checklist, conditions,          │
   │   submit_method, confidence(6항목), parse_logs[]}               │
   └─────────────────────────────┬──────────────────────────────────┘
                                 ▼
   결과 요약/체크리스트 편집/연락처 → export_service.build_export_payload
     (클립보드 TXT / TXT / JSON / CSV 4형식)
   history_service(MAX_HISTORY_ITEMS=5) / compare / debug(파싱 로그·신뢰도)


═══════════════════════════════════════════════════════════════════════════════
 [D] 품질·진단 도구
═══════════════════════════════════════════════════════════════════════════════

  테스트 (총 225개 통과 기록: TS 81 + walk 124 + organizer 20)
   packages/route-engine/tests/   geometry·engine·routeAnalysis
   streamlit_walk_engine/tests/   엔진 포팅 동등성, gps_filter, snap_router,
     mapbox_matcher, nav_session, route/transit_builder, 알림, 스모크, UX 감사
   streamlit_task_organizer/tests/ 파서 단위 + 통합 + 방어(test_defense)

  ux_audit.py — 시나리오 자동 감사(가짜 GPS 노이즈 20런):
    뒤늦은 확정(>3표본) / 깜빡임(이탈 에피소드>1) / 헛경고율(>10%) 검출
  walk_diag.py — 실보행 진단로그: tick/alert/reroute/arrive 레코드
    → diag_summary(백분위) → diag_findings(문제 자동 요약)
    → GitHub walk-diag-logs 브랜치 자동 업로드(토큰 시)
```

## 한 줄 요약

TS로 검증한 이탈 판정 엔진([A])을 Python으로 포팅해([B] engine.py), 브라우저 GPS를 3중 필터(채택→점프가드→스무딩)로 정제한 표본을 1초마다 엔진에 넣고, 오탐을 3층(무료 진행도 → 유료 도로망 → 폴백)으로 걸러낸 뒤에만 백그라운드 재탐색을 수행하는 도보 내비게이션. [C]는 같은 레포에 동거하는 별도의 규칙 기반 할일 정리 서비스.
