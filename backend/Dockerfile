# One image, four commands. Run each as its own service on the host:
#   web      gunicorn config.wsgi:application        (the default CMD; tuned in gunicorn.conf.py)
#   worker   celery -A config worker --loglevel=info
#   beat     celery -A config beat --loglevel=info    (exactly one instance, ever)
#   release  python manage.py release                 (once per deploy, before web starts:
#            migrations, then the required reference data)
# The same lines are in the Procfile for hosts that read one.
FROM python:3.13-slim

# manage.py and config/celery.py default to local settings, so the image pins production.
# Production settings refuse to load without their secrets, which is why nothing in this
# build imports Django: every secret arrives as an environment variable at run time.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

RUN useradd --create-home --uid 10001 app
WORKDIR /app
# Beat writes its schedule file into the working directory.
RUN chown app:app /app

# The lock pins every package by hash; pip refuses anything that does not match.
COPY requirements/base.txt requirements/base.txt
RUN pip install --require-hashes -r requirements/base.txt

COPY --chown=app:app . .

USER app
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application"]
