"""Compatibility launcher for the local Streamlit demo on Windows/Python 3.13."""

from __future__ import annotations

import os
import platform
import socket
from collections import namedtuple
from pathlib import Path


def patch_platform_for_streamlit() -> None:
    """Avoid the hanging Windows platform probe seen in this environment.

    In this machine, ``platform.uname()`` can hang for a long time.
    Streamlit imports code paths that touch ``platform.system()``, which
    delegates to ``platform.uname()`` on Windows. We replace the slow probe
    with a safe static snapshot so the local demo can start normally.
    """

    uname_result = namedtuple(
        "UnameResult",
        ["system", "node", "release", "version", "machine", "processor"],
    )

    platform.uname = lambda: uname_result(  # type: ignore[assignment]
        "Windows",
        socket.gethostname(),
        os.environ.get("OS", "Windows_NT"),
        "unknown",
        os.environ.get("PROCESSOR_ARCHITECTURE", "AMD64"),
        os.environ.get("PROCESSOR_IDENTIFIER", "unknown"),
    )
    platform.platform = lambda aliased=False, terse=False: "Windows"  # type: ignore[assignment]
    platform.processor = lambda: os.environ.get("PROCESSOR_IDENTIFIER", "unknown")  # type: ignore[assignment]


def main() -> None:
    patch_platform_for_streamlit()

    from streamlit.web import bootstrap

    project_root = Path(__file__).resolve().parent.parent
    app_path = project_root / "streamlit_walk_engine" / "app.py"

    bootstrap.run(
        str(app_path),
        False,
        [],
        {
            "server_headless": True,
            "server_address": "127.0.0.1",
            "server_port": 8501,
            "server_fileWatcherType": "none",
            "browser_gatherUsageStats": False,
        },
    )


if __name__ == "__main__":
    main()
