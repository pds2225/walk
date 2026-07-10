# Streamlit Walk Demo

This folder contains a local web demo for the walking route deviation engine.

`Streamlit` is a Python tool that opens a simple web page from code, so you can test the engine in a browser without building a full frontend first.

## What This Demo Shows

- normal walking
- mild drift
- strong deviation
- missed turn

For each sample, the screen shows:
- current state
- suggested next action
- route distance
- heading difference
- reason list

## Run

From the repository root:

```bash
python -m pip install -r streamlit_walk_engine/requirements.txt
python -m streamlit run streamlit_walk_engine/app.py
```

Open:

```text
http://localhost:8501
```

## TMAP 보행자 경로 API 연동 (walk_navi)

내비게이션 페이지의 도보 경로는 TMAP 앱키가 설정되어 있으면
**TMAP 보행자 경로 API**(SK open API, `POST /tmap/routes/pedestrian`)를 사용하고,
키가 없거나 호출이 실패하면 Valhalla(OpenStreetMap)로 자동 대체됩니다.
현재 사용 중인 엔진은 "경로 탐색" 버튼 아래 캡션에 표시됩니다.

앱키는 코드에 넣지 않고 아래 둘 중 한 가지 방법으로 주입합니다.

**로컬 실행** — 저장소 루트에서:

```bash
# 방법 1: secrets 파일 (권장)
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
# → 파일을 열어 TMAP_APP_KEY 값에 실제 앱키 입력

# 방법 2: 환경변수
set TMAP_APP_KEY=실제앱키        # Windows PowerShell: $env:TMAP_APP_KEY="실제앱키"
```

**Streamlit Cloud 배포** — 앱 대시보드 → Settings → Secrets 에 추가:

```toml
TMAP_APP_KEY = "실제앱키"
```

`.streamlit/secrets.toml` 은 `.gitignore` 에 등록되어 있어 GitHub에 올라가지 않습니다.
무료(Free) 요금제는 일일 호출 한도가 있으므로, 한도 초과 시 Valhalla로 자동 전환됩니다.

## Files

- `app.py`: local web UI
- `engine.py`: Python port of the route engine
- `route_builder.py`: geocoding (Nominatim) + walking route (TMAP/Valhalla)
- `scenarios.py`: demo scenarios and sample data
- `requirements.txt`: Python package list
