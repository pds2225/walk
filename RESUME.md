# K-Navi Overnight Resume

Updated: 2026-09-16
Branch: `feat/mangwon-realdata-demo`

## 완료
- `TASK.md`를 최신 밤샘 자율실행 순서로 재정렬
- PC 절대경로 의존 제거
- 사용자 승인 대기 없이 best-effort로 계속 진행하도록 실행계약 추가
- Screen 01에서 점포 switcher를 hero/detail 아래로 이동
- Screen 01의 내부용 `Selected Store` eyebrow 제거
- Screen 02 기본 구조 구현: Nearby Shops → Storefront 360 → Map → Start Walking Guide
- Screen 02 모바일 스타일 추가
- Screen 02 테스트 추가: 점포 선택 일치, Street View 부적합 fallback, K-Navi CTA 연결

## 현재 작업
- 최신 Vercel build/deployment 상태 확인
- Screen 02 compile/runtime 회귀 확인

## 다음 작업
1. build 실패 시 원인 수정
2. 13개 점포 KO/EN 누락 audit
3. Street View handoff 존재 시 자동 통합
4. Screen 01 ↔ Screen 02 실제 플로우 QA
5. 가능한 범위에서 P0 regression 마감
6. 시간이 남으면 Market Overview / Deep Link 진행

## Blocker
- 별도 Street View 조사 handoff 파일은 GitHub 원격에서 아직 확인되지 않음. 없으면 해당 통합만 건너뛰고 다음 작업 진행.
- 로컬 Chromium 시각 QA는 현재 이 원격 작업 세션에서 직접 실행 불가. Vercel build와 코드/테스트 기준 검증을 우선하고, 시각 QA는 후속으로 남김.

## 마지막 검증
- 이전 Screen 01 구현은 Vercel success 이력 있음.
- 최신 Screen 02 변경은 Vercel deployment 진행 상태 확인 중.

## 마지막 remote commit
- 최신 branch HEAD를 기준으로 계속 확인할 것.
