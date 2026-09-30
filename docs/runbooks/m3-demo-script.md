# M3 Live Demo Script

Scannable click path for a live owner demo. Source of truth: [m3-demo-freeze.md](./m3-demo-freeze.md), [m3-staging-acceptance-gate.md](./m3-staging-acceptance-gate.md).  
**Order is mandatory: Customer → Partner → Ops.** Do not skip ahead.

---

## 1. Stack checklist

| Service | Port / note | Ready? |
| --- | --- | --- |
| Django API | `http://localhost:8000` — health `GET /api/v1/health/live/` | ☐ |
| Customer | `http://localhost:3000` | ☐ |
| Partner | `http://localhost:3001` | ☐ |
| Operations | `http://localhost:3002` with **`NEXT_PUBLIC_BASE_PATH=/ops`** → open `http://localhost:3002/ops/...` | ☐ |
| Nginx gateway (optional) | `http://localhost:8080` → `/` customer, `/partner/`, `/ops/`, `/api/` | ☐ |
| Ngrok | HTTPS tunnel → `8080` (or API). Update Razorpay **webhook URL** + **Checkout website allowlist** after hostname change | ☐ |
| Redis + Celery worker | Same settings as API; needed for payment reconciliation / outbox | ☐ |
| PostgreSQL | Migrations + M3 seeds applied | ☐ |

**OTP:** MSG91 is **deferred**. Use `OTP_PROVIDER=development` — after **Send code**, the **6-digit OTP appears on the login screen**.

**Payments:** Prefer Razorpay **test mode** when `PAYMENT_PROVIDER=razorpay` and keys + webhook are wired. Checkout opens on Customer A7 / A9 / wallet / M2 quote pay and Partner vendor subscription → pay → webhook `payment.authorized` / `payment.captured` → booking leaves Pending. Without Razorpay, keep `PAYMENT_PROVIDER=fake` + simulated capture. Never paste secrets into this doc or chat.

**Ops API URL (local direct :3002):** set a **non-empty** `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` (and `API_BASE_URL` the same if used). An empty string is *not* the same as unset — it breaks session/catalog calls (relative `/api/...` hits Next and 404s). Rebuild/restart Ops after changing `NEXT_PUBLIC_*`.

**Dates on screen:** always **DD/MM/YYYY** (rentals + stays UI). APIs stay `YYYY-MM-DD`.

---

## 2. Demo accounts

| Role | Phone | App | Typical paths |
| --- | --- | --- | --- |
| Customer — jobs / wallet | `9900000077` | Customer `:3000` | `/listings`, `/account/wallet`, `/account/coins`, `/account/referral` |
| Customer — rentals | `9900000055` | Customer `:3000` | `/rentals`, `/rentals/mine` |
| Customer — stays | `9900000033` | Customer `:3000` | `/stays` |
| Partner — jobs / listings | `9900000088` | Partner `:3001` | `/listings` (Listings tab, not Work) |
| Partner — rentals | `9900000066` | Partner `:3001` | `/rentals` |
| Partner — stays | `9900000044` | Partner `:3001` | `/stays` |
| Operations | `8019013032` | Ops `:3002` | `/ops/operations/...` (basePath `/ops`) |

**Login:** phone → Send code → enter on-screen OTP → continue.

---

## 3. Demo order (mandatory)

```
CUSTOMER M3 (finish every Customer flow)
  → stop calling Customer the hero
PARTNER M3 (finish every Partner flow)
  → stop Partner
OPERATIONS M3 (finish every Ops requirement)
```

Never advance to the next app only because one flow is hard.

---

## 4. Flow cards

### 4.1 First-7 / M1 booking pay *(brief)*

| | |
| --- | --- |
| **What** | Classic catalog book → pay (First-7 / M1 categories). |
| **Who** | Customer (`9900000077` or any seeded customer) |
| **Click path** | `:3000` → browse category tile → pick service → Book → checkout / pay |
| **Expected** | Order created; payment attempt Pending until capture; after pay, booking confirmed / paid state. |
| **Payment** | With `PAYMENT_PROVIDER=razorpay`: Razorpay Checkout opens; webhook capture; stays **Pending until paid**. |

---

### 4.2 M2 workforce request *(brief)*

| | |
| --- | --- |
| **What** | Assisted / workforce request path (M2 trades). |
| **Who** | Customer; Ops may show assisted queue if relevant |
| **Click path** | `:3000` → Requests / workforce entry → submit requirement → (optional) Ops assisted quote |
| **Expected** | Requirement visible; partner/ops follow-up as seeded. Keep short in live demo. |
| **Payment** | Quote checkout (when shown) uses the same Razorpay **Pending-until-paid** rule. |

---

### 4.3 A10 Careers / Jobs

| | |
| --- | --- |
| **What** | Public job browse + apply. **No applicant payment.** |
| **Who** | Customer `9900000077` → Partner `9900000088` → Ops moderate |
| **Customer path** | `:3000/listings` → open LIVE listing → **Apply** → `:3000/listings/my-applications` |
| **Partner path** | `:3001/listings` → create/submit listing (stays `PENDING_REVIEW`) → applications inbox on LIVE listing |
| **Ops path** | `:3002/ops/operations/listings` → reason → Approve / Reject |
| **Expected** | Drafts not in public browse; apply succeeds; seeded apps for `9900000077` may already show. |
| **Payment** | None for applicant. Partner **vendor subscription** is separate (see §4.7). |

---

### 4.4 A7 Rentals

| | |
| --- | --- |
| **What** | Book asset (fee + deposit) → pay → partner handover → return → release deposit; customer cancel before handover. |
| **Who** | Customer `9900000055` → Partner `9900000066` → Ops moderate assets |
| **Customer book** | `:3000/rentals` → pick asset → choose dates (**DD/MM/YYYY** on screen) → Book → pay fee+deposit |
| **Customer mine** | `:3000/rentals/mine` — status after pay; **Cancel** while `PENDING_PAYMENT` or `CONFIRMED` (pre-handover only) |
| **Partner lifecycle** | `:3001/rentals` → booking **Handover** (`CONFIRMED`) → **Return** (`HANDOVER`) → **Release deposit** (`RETURNED`) |
| **Cancel / return** | Customer **Cancel** pre-handover on mine. Partner does **not** cancel — after handover use **Return**, then deposit release. |
| **Ops** | `:3002/ops/operations/rentals` → pending asset → reason → Approve / Reject |
| **Expected** | After pay: deposit held, booking confirmed. Unpaid stays `PENDING_PAYMENT` and **holds dates until expiry**. |
| **Payment** | Razorpay Checkout for deposit/fee when provider is `razorpay`; webhook; **Pending until paid**. |

**Photo pitfall:** use rental partner **`9900000066`**, not stay host `9900000044`, when demoing rental asset photos / create.

---

### 4.5 A9 Stays (enquiry vs reservation)

| | |
| --- | --- |
| **What** | Dual booking mode: **enquiry** (visit/PG-style) vs **reservation** (hotel/short-stay pay). Check-in/out; cancel. |
| **Who** | Customer `9900000033` → Partner `9900000044` → Ops moderate |
| **Customer enquire** | `:3000/stays` → property with enquiry mode → dates (**DD/MM/YYYY**) → **Send Stay Enquiry** |
| **Customer reserve** | `:3000/stays` → reservation-mode property (e.g. hotel) → Reserve → pay |
| **Customer cancel** | Cancel open enquiry (`SUBMITTED` / `RESPONDED` / `CONFIRMED`) or reservation (`HELD` / `PAYMENT_PENDING` / `CONFIRMED`) from customer stays UI |
| **Partner** | `:3001/stays` → respond to enquiry → **Cancel enquiry** when offered → manage reservation → **Check-in** / **Check-out** |
| **Ops** | `:3002/ops/operations/stays` → pending property → reason → Approve / Reject |
| **Expected** | Enquiry → partner RESPONDED; reservation → Pending until paid, then confirmed; check-in/out advance stay state. |
| **Payment** | Reservation only — Razorpay Checkout when provider is `razorpay`; webhook; **Pending until paid**. Enquiry has no applicant pay. |

---

### 4.6 Wallet top-up + coins / referral

| | |
| --- | --- |
| **What** | Wallet top-up; mention coins burn + referral if time. |
| **Who** | Customer `9900000077`; Ops can show loyalty strip |
| **Click path** | `:3000/account/wallet` → top-up amount → pay; glance `:3000/account/coins`, `:3000/account/referral` |
| **Ops glance** | `:3002/ops/operations/loyalty` — liability / burn / top-up bounds / referral version |
| **Expected** | Top-up attempt Pending until capture; balance credits after webhook/sim capture. Coins/referral pages load with seeded policy. |
| **Payment** | Razorpay or simulate; **Pending until paid/captured**. |

---

### 4.7 Vendor subscription (Partner)

| | |
| --- | --- |
| **What** | Partner purchases a listing / vendor plan via Razorpay. |
| **Who** | Partner (jobs partner `9900000088` or relevant seeded seller) |
| **Click path** | `:3001` → listings / subscription / plans UI → select plan → pay |
| **Ops setup** | `:3002/ops/operations/vendor-plans` — confirm plans exist before Partner pay |
| **Expected** | Checkout opens; after capture, subscription active / paid state on partner. |
| **Payment** | Partner Razorpay Checkout when `PAYMENT_PROVIDER=razorpay`; webhook; **Pending until paid**. |

---

### 4.8 Operations console

**Who:** Ops `8019013032` only. Login OTP on screen like the others.

**Nav groups (sidebar order):** Work → People → Money → Dashboards → System.  
Reports sits under **Money**; Overview / Categories (and other kind dashboards) under **Dashboards**.

| Flow | URL (local with basePath `/ops`) | Expected |
| --- | --- | --- |
| Overview dashboard | `http://localhost:3002/ops/operations/dashboards/overview` | Overview metrics load |
| Categories dashboard | `http://localhost:3002/ops/operations/dashboards/categories` | Category breakdown |
| Reports (Looker-style) | `http://localhost:3002/ops/operations/reports` | See card below |
| Vendor plans | `http://localhost:3002/ops/operations/vendor-plans` | Plans list / manage |
| Moderate rentals | `http://localhost:3002/ops/operations/rentals` | Reason required → Approve / Reject |
| Moderate stays | `http://localhost:3002/ops/operations/stays` | Reason required → Approve / Reject |
| Moderate listings (optional) | `http://localhost:3002/ops/operations/listings` | Same reason gate |
| Loyalty glance | `http://localhost:3002/ops/operations/loyalty` | Liability / burn / referral |

#### Reports page (Looker-style)

| | |
| --- | --- |
| **URL** | `http://localhost:3002/ops/operations/reports` |
| **Click path** | Login `8019013032` → sidebar **Money** → **Reports** |
| **UI** | Report-type **pills** → date/text **filters** → **KPI** totals strip → preview **table** → export **CSV / Excel / PDF** → optional **filter presets** (save / load chips) |
| **Expected** | Catalog loads; selecting a report refreshes KPIs + table; export downloads; presets restore filters. If session/catalog 404, fix Ops `NEXT_PUBLIC_API_BASE_URL` (see §1 / pitfalls). |

---

## 5. Suggested live sequence (tight)

1. **Stack green** — `:8000/api/v1/health/live/`, `:3000`, `:3001`, `:3002/ops` (and `:8080` / ngrok if Razorpay).
2. **Customer** — M1 pay (30s) → A10 apply (`0077`) → A7 book+pay + cancel glance (`0055`) → A9 enquire + one reserve + cancel glance (`0033`) → wallet top-up glance (`0077`).
3. **Partner** — stay respond / cancel enquiry + check-in/out (`0044`) → rental handover → **return** → release (`0066`) → vendor plan pay (`0088`).
4. **Ops** — nav: Work / People / Money / Dashboards / System → Overview + Categories → **Reports** (pills → filters → KPIs → export) → vendor plans → approve one rental + one stay.

---

## 6. Known pitfalls

| Symptom / mistake | Fix / remember |
| --- | --- |
| Connection lost / **502** | Stack down — check API, Next apps, nginx, ngrok |
| Ops session / catalog **404** | Ops needs **non-empty** `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` for direct `:3002` (empty string → relative API → Next 404). Restart/rebuild after change. |
| Ops links missing `/ops` | App started with `NEXT_PUBLIC_BASE_PATH=/ops` — use `http://localhost:3002/ops/...` |
| Unpaid rental “blocks” dates | Expected — holds until payment **expiry** |
| Dates look wrong | UI is **DD/MM/YYYY**; APIs stay `YYYY-MM-DD` |
| Rental photos / create on wrong partner | Use **`9900000066`**, not stay host `9900000044` |
| OTP not in SMS | Expected — development OTP **on screen**; MSG91 deferred |
| Razorpay Checkout “Uh! oh! Something went wrong” | Add current HTTPS origin to Razorpay **Checkout website allowlist** (ngrok host). See [m3-razorpay-integration.md](./m3-razorpay-integration.md) |
| Razorpay pay succeeds but booking stuck Pending | Webhook URL stale (ngrok restart), wrong events, or Celery/worker down. Events: `payment.authorized`, `payment.captured`, `payment.failed` |
| Wrong customer phone for rentals/stays | Rentals `0055`, stays `0033`, jobs `0077` |
| Too many OTP requests | Wait before re-send on the same phone |
| Cancel rental after handover | Not allowed for customer — partner **Return** path only |

---

## 7. Quick links

| Doc | Use |
| --- | --- |
| [m3-demo-freeze.md](./m3-demo-freeze.md) | Seeds, phones, OTP, payment config |
| [m3-staging-acceptance-gate.md](./m3-staging-acceptance-gate.md) | Razorpay / Celery / ngrok gate |
| [local-ngrok-nginx-gateway.md](./local-ngrok-nginx-gateway.md) | Gateway + webhook path + Checkout allowlist |
| [m3-razorpay-integration.md](./m3-razorpay-integration.md) | Provider wiring + Checkout allowlist (no secrets) |
| [m3-msg91-otp.md](./m3-msg91-otp.md) | MSG91 (deferred) |
