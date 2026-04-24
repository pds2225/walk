"""Install the Streamlit demo requirements only when the pinned versions are missing."""

from __future__ import annotations

import subprocess
import sys
from importlib import metadata
from pathlib import Path

REQUIREMENTS_PATH = Path(__file__).with_name("requirements.txt")


def parse_requirements() -> dict[str, tuple[str, str]]:
    """Return {package: (operator, version)} for each pinned requirement."""
    requirements: dict[str, tuple[str, str]] = {}
    for raw_line in REQUIREMENTS_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        for op in ("==", ">=", "<=", "~="):
            if op in line:
                package_name, version = line.split(op, maxsplit=1)
                requirements[package_name.strip()] = (op, version.strip())
                break
    return requirements


def requirements_are_satisfied(requirements: dict[str, tuple[str, str]]) -> bool:
    from packaging.version import Version  # type: ignore[import-untyped]

    for package_name, (op, expected_version) in requirements.items():
        try:
            installed_version = metadata.version(package_name)
        except metadata.PackageNotFoundError:
            print(f"[missing] {package_name}{op}{expected_version}")
            return False

        try:
            iv = Version(installed_version)
            ev = Version(expected_version)
            satisfied = (
                (op == "==" and iv == ev)
                or (op == ">=" and iv >= ev)
                or (op == "<=" and iv <= ev)
                or (op == "~=" and iv >= ev and iv.major == ev.major)
            )
        except Exception:
            satisfied = installed_version == expected_version

        if not satisfied:
            print(f"[mismatch] {package_name}: installed {installed_version}, need {op}{expected_version}")
            return False

    return True


def main() -> int:
    requirements = parse_requirements()

    if requirements_are_satisfied(requirements):
        print("Streamlit demo requirements already installed.")
        for package_name, version in requirements.items():
            print(f"- {package_name}=={version}")
        return 0

    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "-r",
        str(REQUIREMENTS_PATH),
        "--disable-pip-version-check",
    ]
    completed = subprocess.run(command, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
