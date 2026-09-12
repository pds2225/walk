# MiMo 실행 지시 — `walk` 루트 폴더 정리

이 문서는 Xiaomi MiMo가 `walk` 저장소를 직접 점검·정리하기 위한 실행 프롬프트다.

**이 파일을 읽은 AI는 아래 지시를 순서대로 그대로 실행한다.**
사용자에게 중간 승인이나 추가 결정을 요구하지 말고, 안전하게 판단 가능한 범위까지 자율 실행한다.

---

## 0. 작업 목표

현재 저장소 `walk`의 루트 폴더 구조를 정리한다.

목표:

- 도보네비게이션 `walk`와 직접 관계없는 코드·폴더를 분리 또는 제거
- 루트에는 실제 실행·빌드·배포·공통 설정에 필요한 항목만 남김
- 기능 변경 없이 repository structure만 정리
- Vercel / Next.js / Streamlit / 테스트가 깨지지 않아야 함

중요:

- GitHub에 root cleanup 관련 PR `#101`이 존재할 수 있다.
- 작업 시작 전에 반드시 remote 상태와 PR 반영 여부를 확인한다.
- 이미 처리된 변경을 중복 적용하지 않는다.
- 사용자가 만든 기존 수정사항을 임의로 되돌리지 않는다.

---

## 1. STEP 0 — 현재 상태 확인

먼저 아래를 조사한다.

1. `git status --short`
2. 현재 branch
3. `origin/main` 대비 ahead / behind
4. 최근 commit 10개
5. 저장소 루트의 파일/폴더 전체
6. `package.json` workspace
7. `vercel.json`
8. Python requirements 구조
9. `README.md` / `AGENTS.md`에서 실행 경로로 참조하는 폴더
10. 코드 전체에서 루트 폴더명을 참조하는 import / path / config 검색
11. GitHub PR #101이 존재하면 변경 내용과 현재 branch에 이미 반영되었는지 확인

사용자에게 추가 질문하지 말고 조사 결과를 기반으로 판단한다.

---

## 2. STEP 1 — 루트 항목 분류

루트의 모든 항목을 다음 4개로 분류한다.

### A. 반드시 루트 유지

- `README.md`
- `AGENTS.md`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `eslint.config.js`
- `vitest.config.ts`
- `vercel.json`
- `requirements.txt`
- `requirements-dev.txt`
- Git / Claude / Streamlit 등 실제 사용 중인 설정

### B. 핵심 애플리케이션

- `web/`
- `streamlit_walk_engine/`
- `packages/`

### C. 개발·운영 지원

- `docs/`
- `scripts/`

### D. walk와 무관하거나 과거 실험·중복·임시 프로젝트

기능·import·build·deploy·test 참조 여부를 조사한 뒤 정리 후보로 분류한다.

특히 다음을 확인한다.

`streamlit_task_organizer/`

이 폴더가 아직 존재한다면:

- `walk` 도보네비와 직접 관련 있는지 확인
- package workspace, Vercel, Streamlit, Python imports, 테스트, 문서에서 참조되는지 전수검색
- 완전히 독립적인 텍스트 일정/체크리스트 MVP라면 `walk` 저장소에서 제거
- 참조가 존재하면 먼저 안전하게 참조 관계를 분석하고 임의 삭제하지 않는다

---

## 3. STEP 2 — 목표 루트 구조

가능하면 최종 루트를 아래처럼 단순화한다.

```text
walk/
├─ .claude/
├─ .streamlit/
├─ docs/
├─ packages/
│  └─ route-engine/
├─ scripts/
├─ streamlit_walk_engine/
├─ web/
├─ .gitignore
├─ AGENTS.md
├─ README.md
├─ eslint.config.js
├─ package.json
├─ package-lock.json
├─ requirements.txt
├─ requirements-dev.txt
├─ tsconfig.json
├─ vercel.json
└─ vitest.config.ts
```

단, 실제 시스템상 필요한 파일이 있다면 삭제하지 말고 유지한다.

폴더를 억지로 위 구조에 맞추는 것이 목적이 아니다.
**실제 의존관계와 정상 동작 보존을 우선한다.**

---

## 4. STEP 3 — 중복 구조 검사

다음 중복도 확인한다.

1. `requirements.txt` vs `streamlit_walk_engine/requirements.txt`
2. 루트 TypeScript 설정 vs `web/tsconfig.json`
3. `README.md` vs `web/README.md` vs `streamlit_walk_engine/README.md`
4. `scripts/` 안의 오래된 백업·maintenance 스크립트
5. `docs/` 안의 `DONE`, `PLAN`, `TASK`, `PROMPT`, `NIGHT TASK`, `progress-notes` 등 과거 작업 기록

중복이라고 무조건 삭제하지 않는다.

원칙:

- 실행·빌드에 필요한 설정 → 유지
- 현재 운영 문서 → 유지
- 완료된 단기 작업지시서 → `docs/archive/` 이동 후보
- 의미 불명확 → 그대로 유지하고 최종 보고
- 기능 코드 → 임의 이동 금지

---

## 5. STEP 4 — 수정

안전하다고 확인된 항목만 수정한다.

### 금지

- 핵심 기능 리팩토링
- API 로직 변경
- UI 변경
- 환경변수 값 변경
- `.env`, `.env.*` 내용 출력 또는 수정
- API Key / Token / 비밀번호 출력
- Vercel 설정 임의 변경
- `streamlit_walk_engine/pages/1_Navigation.py` 불필요 수정
- 사용자 기존 변경사항 되돌리기
- 의미가 불명확한 파일 임의 삭제

### 파일 이동 시 반드시 함께 확인

- import
- relative path
- npm script
- Python path
- README 실행 명령어
- Vercel build path
- 테스트 경로
- CI / 배포 설정

---

## 6. STEP 5 — 검증

정리 후 가능한 검증을 전부 실행한다.

### Python

```powershell
python -m pytest streamlit_walk_engine/tests -q
```

### Node / Next.js

```powershell
npm run test:run
npm run lint
npm run typecheck
npm run next:build
```

각 명령에 대해 다음을 기록한다.

- PASS / FAIL
- 테스트 수
- 실패 원인

기존 오류가 있으면 반드시 아래처럼 구분한다.

- 이번 정리로 발생한 오류
- 기존부터 존재하던 오류

실행할 수 없는 검증은 `미검증`으로 명시하고 이유를 기록한다.

---

## 7. STEP 6 — Git 최종 검토

마지막에 반드시 확인한다.

```powershell
git status --short
git diff --stat
git diff
```

그리고 아래도 확인한다.

- 작업 범위 밖 변경이 섞였는지
- 삭제한 파일이 실제로 미참조였는지
- 경로 변경 후 README / 스크립트 / 설정 참조가 깨지지 않았는지

사용자 코드의 기존 변경사항을 덮어쓰지 않는다.

작업 범위 밖 변경이 이미 존재하면 제거하지 말고 별도로 표시한다.

---

## 8. STEP 7 — 최종 보고 형식

아래 형식으로 최종 보고한다.

```text
[ROOT BEFORE]
기존 루트 구조

[ROOT AFTER]
정리 후 루트 구조

[REMOVED]
삭제한 파일/폴더 + 삭제 근거

[MOVED]
이동한 파일 + 이전/이후 경로 + 이동 근거

[KEPT]
애매하지만 유지한 항목 + 유지 이유

[DEPENDENCY CHECK]
import / npm / Python / Vercel / README 참조 확인 결과

[TEST]
Python:
Node:
Next build:

[GIT]
현재 branch:
변경 파일 수:
삭제 파일 수:
git diff 요약:

[RISK]
남은 위험요소

[NEXT]
추가 정리가 필요한 경우 최대 5개만 우선순위순으로 제안
```

---

## 9. 실행 원칙

- 질문 없이 가능한 범위까지 자율적으로 진행한다.
- 추측해서 삭제하지 않는다.
- 구조 정리가 기능 변경으로 확대되지 않게 한다.
- 한 번에 대규모 리팩토링하지 않는다.
- 정상 동작 보존이 루트 깔끔함보다 우선이다.
- 테스트 실패 상태에서 임의로 `main`에 push하지 않는다.
- `main` force push 금지.
- 작업 시작 시 현재 branch가 `main`이면, 안전을 위해 정리 작업용 branch를 새로 생성하는 것을 우선한다.
- 작업이 끝나도 사용자가 명시적으로 요청하지 않은 경우 merge는 하지 않는다.

---

## 10. 완료 조건

다음 조건을 모두 만족하면 작업 완료로 판단한다.

- 루트의 모든 항목을 목적별로 설명 가능
- `walk`와 무관한 독립 프로젝트가 제거 또는 명확히 분리됨
- import/path/build/deploy 참조 오류 없음
- Python 테스트 결과 확인
- Node/Vitest 결과 확인
- lint/typecheck 결과 확인
- Next.js build 결과 확인
- `git diff` 최종 검토 완료
- 기존 사용자 변경사항 손상 없음
- 최종 보고 작성 완료
