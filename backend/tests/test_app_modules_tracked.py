"""Guards against a local app being wired into settings but never committed.

`config/settings/base.py` listed `apps.ops_reports` in `INSTALLED_APPS` while every
file of that app was untracked, so a clean clone raised `ModuleNotFoundError` during
startup. Nothing in the suite noticed: the import succeeds on the machine where the
directory happens to exist, and git is never consulted.

This test asks git directly. It fails the moment tracked configuration references a
local app that is not itself tracked, which is the only state where the branch
imports locally and cannot be cloned.

The path handed to git is derived from the imported module rather than assembled
from the dotted name, because the dotted name says `apps.ops_reports` while the
repository path is `backend/apps/ops_reports`. Building `apps/ops_reports` by hand
matches no file and reports every app as untracked.
"""

from __future__ import annotations

import importlib
import shutil
import subprocess
from pathlib import Path
from types import ModuleType

import pytest
from django.conf import settings

REPO_ROOT = Path(__file__).resolve().parents[2]

GIT_TIMEOUT_SECONDS = 30


def _git_executable() -> str | None:
    """Absolute path to git, so the call never relies on a PATH lookup."""

    return shutil.which("git")


def _module_directory(entry: str) -> Path | None:
    """Directory holding the app, or None when the module cannot be located."""

    try:
        module: ModuleType = importlib.import_module(entry)
    except ImportError:
        return None
    if module.__file__ is None:
        return None
    return Path(module.__file__).resolve().parent


def _tracked_files(git: str, relative_path: str) -> list[str] | None:
    """Tracked paths under `relative_path`, or None when git cannot answer."""

    try:
        # argv is a fixed list and the only variable is a path derived from an
        # imported module inside this checkout, so there is no untrusted input.
        result = subprocess.run(  # noqa: S603
            [git, "-C", str(REPO_ROOT), "ls-files", "--", relative_path],
            capture_output=True,
            text=True,
            check=False,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None
    return [line for line in result.stdout.splitlines() if line.strip()]


def test_every_local_installed_app_is_tracked() -> None:
    git = _git_executable()
    if not (REPO_ROOT / ".git").exists() or git is None:
        pytest.skip("Not a git checkout, so tracked-file state cannot be inspected.")

    local_apps = [entry for entry in settings.INSTALLED_APPS if entry.startswith("apps.")]
    assert local_apps, "Expected this project to install its own apps.* modules."

    untracked: list[str] = []
    for entry in local_apps:
        directory = _module_directory(entry)
        if directory is None:
            continue

        try:
            relative = directory.relative_to(REPO_ROOT)
        except ValueError:
            # An app installed from outside the checkout is not ours to track.
            continue

        tracked = _tracked_files(git, str(relative))
        if tracked is None:
            pytest.skip("git could not list files, so tracked apps cannot be verified.")
        if not tracked:
            untracked.append(entry)

    assert not untracked, (
        "These apps are in INSTALLED_APPS but have no tracked files, so a clean "
        f"clone cannot start: {', '.join(sorted(untracked))}."
    )
