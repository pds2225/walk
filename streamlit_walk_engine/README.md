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

## Files

- `app.py`: local web UI
- `engine.py`: Python port of the route engine
- `scenarios.py`: demo scenarios and sample data
- `requirements.txt`: Python package list
