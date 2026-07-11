# Text Task Organizer MVP

비정형 텍스트를 붙여넣으면 제목, 기한, 할 일 요약, 체크리스트, 연락처를 구조화해 주는 Streamlit MVP입니다.

## 실행 방법

1. 가상환경 생성
2. 패키지 설치
3. Streamlit 실행

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r streamlit_task_organizer/requirements.txt
streamlit run streamlit_task_organizer/app.py
```

## 포함 기능

- 단일 메인 화면 기반 입력/파싱/수정/내보내기 흐름
- 규칙 기반 제목, 날짜, 체크리스트, 연락처 추출
- 세션 기준 최근 결과 5건 히스토리
- TXT / JSON / CSV 다운로드
- 원문과 구조화 결과 비교
- 개발자 모드에서 파싱 로그와 신뢰도 확인

## 폴더 구조

```text
streamlit_task_organizer/
├─ app.py
├─ parser/
├─ samples/
├─ schemas/
├─ services/
├─ tests/
└─ utils/
```

## 테스트

```bash
python -m pytest streamlit_task_organizer/tests
```
