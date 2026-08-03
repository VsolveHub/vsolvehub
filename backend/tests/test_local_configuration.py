from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
LOCAL_POSTGRES_PORT = "15432"


def test_local_postgres_port_is_consistent_across_runtime_defaults() -> None:
    compose = (REPOSITORY_ROOT / "infra" / "compose.yaml").read_text(encoding="utf-8")
    infra_example = (REPOSITORY_ROOT / "infra" / ".env.example").read_text(encoding="utf-8")
    backend_example = (REPOSITORY_ROOT / "backend" / ".env.example").read_text(encoding="utf-8")
    settings = (REPOSITORY_ROOT / "backend" / "config" / "settings" / "base.py").read_text(
        encoding="utf-8"
    )

    assert f"${{POSTGRES_PORT:-{LOCAL_POSTGRES_PORT}}}:5432" in compose
    assert f"POSTGRES_PORT={LOCAL_POSTGRES_PORT}" in infra_example
    assert f"127.0.0.1:{LOCAL_POSTGRES_PORT}/vsolve" in backend_example
    assert f"127.0.0.1:{LOCAL_POSTGRES_PORT}/vsolve" in settings
