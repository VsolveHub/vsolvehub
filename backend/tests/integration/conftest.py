"""A real Celery worker in a real subprocess, pointed at pytest-django's test database."""

import contextlib
import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
import redis
from django.conf import settings
from django.db import connection

BACKEND_DIR = Path(__file__).resolve().parents[2]
WORKER_BOOT_TIMEOUT_SECONDS = 60
WORKER_STOP_TIMEOUT_SECONDS = 15


def _test_database_url() -> str:
    """The URL of the database pytest-django created, not the developer's own database."""
    config = connection.settings_dict
    return (
        f"postgresql://{config['USER']}:{config['PASSWORD']}"
        f"@{config['HOST']}:{config['PORT']}/{config['NAME']}"
    )


@pytest.fixture(scope="session", autouse=True)
def require_redis() -> None:
    """Fail loudly rather than silently degrading to a suite that proves nothing."""
    try:
        redis.Redis.from_url(settings.CELERY_BROKER_URL).ping()
    except Exception as exc:
        pytest.fail(
            "The integration suite requires the Redis in infra/compose.yaml. "
            f"Could not reach {settings.CELERY_BROKER_URL}: {exc}"
        )


@pytest.fixture(autouse=True)
def clean_broker() -> None:
    """Never inherit queue entries from a previous run — they make failures unreadable."""
    redis.Redis.from_url(settings.CELERY_BROKER_URL).flushdb()


def _start_worker(database_url: str) -> subprocess.Popen[bytes]:
    environment = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings.integration",
        "DATABASE_URL": database_url,
    }
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "celery",
            "-A",
            "config",
            "worker",
            "--loglevel=info",
            "--concurrency=1",
            "--pool=solo",
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
        ],
        cwd=BACKEND_DIR,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if process.poll() is not None:
        pytest.fail("The Celery worker exited immediately during boot.")
    return process


def _stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.kill()
    with contextlib.suppress(subprocess.TimeoutExpired):
        process.wait(timeout=WORKER_STOP_TIMEOUT_SECONDS)


@pytest.fixture
def worker_factory(
    db: None,  # noqa: ARG001 - requested so the test database exists, not for its value
) -> Iterator[Callable[[], subprocess.Popen[bytes]]]:
    """Start one or more workers against the test database, and always reap them."""
    database_url = _test_database_url()
    started: list[subprocess.Popen[bytes]] = []

    def start() -> subprocess.Popen[bytes]:
        process = _start_worker(database_url)
        started.append(process)
        return process

    try:
        yield start
    finally:
        for process in started:
            _stop(process)


@pytest.fixture
def marker_dir() -> Iterator[Path]:
    """A scratch directory the worker subprocess can write to.

    Deliberately not pytest's `tmp_path`: its per-user root is a long-lived directory that
    survives between runs, and a single unreadable one breaks every test that needs a file.
    `mkdtemp` allocates a fresh directory under the same root with no such shared state.
    """
    path = Path(tempfile.mkdtemp(prefix="vsolve-integration-"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def await_condition(predicate: Callable[[], bool], *, timeout: int, interval: float = 0.25) -> bool:
    """Poll until the predicate holds or the timeout expires."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False
