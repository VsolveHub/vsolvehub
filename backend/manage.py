#!/usr/bin/env python
"""Django administrative entry point."""

import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    try:
        from django.core.management import execute_from_command_line  # noqa: PLC0415
    except ImportError as exc:
        raise ImportError(
            "Django is not available. Activate backend/.venv and install "
            "backend/requirements/dev.txt."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
