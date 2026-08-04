"""Every entrypoint has to agree on which environment it is running in.

`manage.py` and `config/celery.py` each pick a default `DJANGO_SETTINGS_MODULE`,
and they disagreed: management commands ran against `local` while the Celery
worker defaulted to `production`. Locally that raised `ImproperlyConfigured` on
the placeholder secret key, which was the *good* outcome — the quiet one is a
worker that starts against production's database, cache and storage while the
developer believes it is theirs.

`.env` cannot express this preference: `config.settings.local` is the module that
reads `.env`, so a `DJANGO_SETTINGS_MODULE` line in it is consulted only after the
decision has been made. Asserting the source of truth is therefore the only way
to hold the two together.
"""

import ast
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
SETTING_NAME = "DJANGO_SETTINGS_MODULE"
SETDEFAULT_ARG_COUNT = 2


def _default_settings_module(path: Path) -> str | None:
    """Extracts the literal from `os.environ.setdefault(SETTING_NAME, "…")`."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or len(node.args) != SETDEFAULT_ARG_COUNT:
            continue
        function = node.func
        if not isinstance(function, ast.Attribute) or function.attr != "setdefault":
            continue
        name, value = node.args
        if not isinstance(name, ast.Constant) or name.value != SETTING_NAME:
            continue
        return value.value if isinstance(value, ast.Constant) else None
    return None


def test_manage_and_celery_default_to_the_same_settings_module() -> None:
    manage = _default_settings_module(BACKEND_DIR / "manage.py")
    celery = _default_settings_module(BACKEND_DIR / "config" / "celery.py")

    assert manage is not None, "manage.py no longer sets a default settings module."
    assert celery is not None, "config/celery.py no longer sets a default settings module."
    assert celery == manage, (
        "manage.py and config/celery.py must default to the same environment, "
        f"got {manage!r} and {celery!r}."
    )


def test_the_shared_default_is_the_local_environment() -> None:
    """A deployment sets the variable explicitly; a developer should not have to."""
    assert _default_settings_module(BACKEND_DIR / "config" / "celery.py") == "config.settings.local"
