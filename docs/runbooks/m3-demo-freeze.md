# M3 Demo Freeze Runbook

## Overview
End-of-week checklist and seed commands for the M3 demo freeze.

## Prerequisites
- Python 3.13, Node.js 20+, pnpm 11+
- PostgreSQL 15+ running locally
- Redis running locally (for Celery/cache)

## Environment Setup
```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements/dev.txt

# Apply migrations
python manage.py migrate --settings=config.settings.local

# Frontend
cd ../frontend
pnpm install
```

## Seed Commands (run in order)
```bash
cd backend

# 1. Core catalog (M1 first 7 categories)
python manage.py seed_task_catalog --settings=config.settings.local

# 2. M2 workforce trades
python manage.py seed_m2_demo --settings=config.settings.local

# 3. A10 Career listings
python manage.py seed_listing_catalog --settings=config.settings.local

# 4. A7 Rental assets
python manage.py seed_rental_demo --settings=config.settings.local

# 5. A9 Stay properties (now includes Hotels + dual booking mode)
python manage.py seed_stay_demo --settings=config.settings.local

# 6. Console demo data
python manage.py seed_console_demo_data --settings=config.settings.local
```

## Application Startup (one at a time)
```bash
# Backend API
cd backend
python manage.py runserver 8000 --settings=config.settings.local

# Customer (port 3000)
cd frontend && pnpm dev:customer

# Partner (port 3001)
cd frontend && pnpm dev:partner

# Operations (port 3002)
cd frontend && pnpm dev:admin
```

## Demo Order: Customer → Partner → Ops

### Customer Demo (port 3000)
1. Login: phone 9900000033 (Demo Stay Guest) or 9900000055 (Rental Customer)
2. Browse categories → Book a service → Payment simulation
3. Browse stays → Enquire / Reserve based on booking_mode
4. Browse rentals → Book equipment → Fee + deposit payment
5. Browse listings → Apply for job

### Partner Demo (port 3001)
1. Login: phone 9900000044 (Stay Host) or 9900000066 (Rental Partner)
2. View properties → Respond to enquiries / Manage reservations
3. View rental assets → Handover/Return bookings
4. View listing subscriptions → Purchase plan

### Ops Demo (port 3002, basePath `/ops`)
1. Login: phone 8019013032 (Ops user) at `http://localhost:3002/ops/...`
2. Sidebar groups: Work / People / Money / Dashboards / System
3. Overview + Categories dashboards → Reports (pills / filters / KPIs / table / CSV·Excel·PDF / presets)
4. Moderate stays and rentals
5. Manage vendor subscription plans
6. Local Ops needs non-empty `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` (empty string → session/catalog 404)

## Post-Demo: Seed-Only Mindset
After green demo, NO new features. Only seed data updates and bug fixes.

## Payment Configuration
- Default: `PAYMENT_PROVIDER=fake` + `PAYMENTS_ALLOW_SIMULATED_CAPTURE=true`
- Razorpay live test: paste `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET` into `backend/.env` only; set `PAYMENT_PROVIDER=razorpay` and simulated capture `false`. See `docs/runbooks/m3-razorpay-integration.md`
- Empty Razorpay keys with `PAYMENT_PROVIDER=razorpay` fail closed — keep `fake` for demo
- Never commit secrets to source

## OTP Configuration
- Default: `OTP_PROVIDER=development` — **6-digit code appears on the login screen** after Send code
- Demo phones (10 digits): Customer jobs `9900000077`, rentals `9900000055`, stays `9900000033`; Partners `9900000088` / `9900000066` / `9900000044`; Ops `8019013032`
- MSG91: paste keys into `.env`, set `OTP_PROVIDER=msg91`. See `docs/runbooks/m3-msg91-otp.md`

## Date display
- All human-visible dates must read **DD/MM/YYYY** (Indian). Wire/API stay `YYYY-MM-DD`.

## End-of-Week-1 Checklist
- [ ] All seed commands run without errors
- [ ] Customer browse, enquire (visit types), reserve+pay (hotels/short stay), book rentals (fee+deposit), apply jobs
- [ ] Partner property management, enquiry response, reservation check-in/out, rental handover
- [ ] Ops Overview + Categories dashboards; reports CSV/XLSX/PDF; vendor plans
- [ ] Payment simulation works for A7 booking, A9 reservation, wallet top-up, vendor sub
- [ ] Development OTP login works for all demo phones
- [ ] UI dates show DD/MM/YYYY
- [ ] No type errors in frontend build
- [ ] No migration drift (`makemigrations --check` clean)
- [ ] **After client approval only:** merge to `main`, staging auto-deploy (`docs/runbooks/staging-deploy.md`)
