# Staging Deployment Runbook (Post-Approval)

> **Status**: DRAFT — scaffolding only. Do not push to main.

## Overview
Staging auto-deploy configuration for Vsolve Hub after M3 demo approval.

## Proposed CI/CD Pipeline

### GitHub Actions Workflow (draft)
File: `.github/workflows/staging-deploy.yml` (NOT CREATED — scaffolding only)

```yaml
name: Staging Deploy
on:
  push:
    branches: [staging]

jobs:
  backend-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: |
          cd backend
          python -m venv .venv
          source .venv/bin/activate
          pip install -r requirements/dev.txt
          python manage.py spectacular --validate --settings=config.settings.staging
          python manage.py makemigrations --check --dry-run --noinput --settings=config.settings.staging

  frontend-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - run: |
          cd frontend
          pnpm install --frozen-lockfile
          pnpm lint
          pnpm typecheck
          pnpm build

  deploy:
    needs: [backend-check, frontend-check]
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy to staging environment"
      # Actual deployment steps to be configured post-approval
```

## Environment Variables (staging)
- `PAYMENT_PROVIDER=razorpay` (test mode keys)
- `OTP_PROVIDER=msg91` (or development for staging)
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — staging test-mode keys (never committed)
- `PAYMENT_WEBHOOK_SECRET` — separate from production
- `MSG91_AUTH_KEY` / `MSG91_OTP_TEMPLATE_ID` — staging template

## Database
- Staging PostgreSQL with seed data from m3-demo-freeze.md
- Migrations applied automatically on deploy

## Post-Approval Actions
1. Create `staging` branch from `main`
2. Configure GitHub environment secrets
3. Set up staging server (cloud provider TBD)
4. Enable the workflow file
5. Run seed commands on staging database
