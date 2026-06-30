# VSolveHub — Third-Party Integrations Specification

**Document ID:** INT-MASTER  
**Version:** 1.1  
**Last Updated:** 2026-06-17  
**Status:** Draft — Under Review  
**Owner:** Platform Engineering + Product

> **v1.1 Change:** Added INT-008 DigiLocker for worker Aadhaar verification. Manual Aadhaar photo upload is now the fallback path only. DigiLocker is the primary KYC verification method for worker onboarding.

---

## Table of Contents

1. [Master Integration Map](#master-integration-map)
2. [INT-001: WhatsApp Business API](#int-001-whatsapp-business-api)
3. [INT-002: SMS / OTP](#int-002-sms--otp)
4. [INT-003: Firebase Cloud Messaging (FCM)](#int-003-firebase-cloud-messaging-fcm)
5. [INT-004: Google Maps API](#int-004-google-maps-api)
6. [INT-005: Google Analytics 4 (GA4)](#int-005-google-analytics-4-ga4)
7. [INT-006: Email SMTP](#int-006-email-smtp)
8. [INT-007: reCAPTCHA v3](#int-007-recaptcha-v3)
9. [INT-008: DigiLocker (Aadhaar Verification)](#int-008-digilocker-aadhaar-verification)
10. [Environment Variable Master Reference](#environment-variable-master-reference)
11. [Integration Health Dashboard](#integration-health-dashboard)

---

## Master Integration Map

> High-level view of every third-party system and how it connects to the VSolveHub platform.

```mermaid
graph TB
    subgraph Clients["Client Applications"]
        WEB["Next.js 15\nWeb App"]
        CMA["Flutter\nCustomer App"]
        WKA["Flutter\nWorker App"]
    end

    subgraph Backend["Django 5 Backend (DRF + PostgreSQL 16)"]
        API["REST API Layer"]
        TASKS["Celery Task Queue"]
        DB[("PostgreSQL 16")]
        CACHE[("Redis Cache")]
    end

    subgraph Notifications["Notification Layer"]
        WA["INT-001\nWhatsApp Business API\nWATI / Twilio"]
        SMS["INT-002\nSMS / OTP\nMSG91 / Fast2SMS / Twilio"]
        FCM["INT-003\nFirebase Cloud Messaging"]
        EMAIL["INT-006\nEmail SMTP\nSendGrid / Mailgun"]
    end

    subgraph Analytics["Analytics and Trust"]
        GA4["INT-005\nGoogle Analytics 4"]
        RECAP["INT-007\nreCAPTCHA v3"]
    end

    subgraph Maps["Location Services"]
        GMAPS["INT-004\nGoogle Maps API\nMaps JS + Places + Geocoding"]
    end

    subgraph KYC["Identity & KYC"]
        DL["INT-008\nDigiLocker\nAadhaar Verification (OAuth 2.0)"]
    end

    subgraph Users["End Users"]
        CUST["Customers"]
        WORKER["Workers / Riders"]
        ADMIN["Admin Team"]
    end

    CUST -->|"Browses / Books"| WEB
    CUST -->|"Browses / Books"| CMA
    WORKER -->|"Accepts Jobs"| WKA
    ADMIN -->|"Manages Platform"| WEB

    WEB <-->|"API Calls"| API
    CMA <-->|"API Calls"| API
    WKA <-->|"API Calls"| API

    API <-->|"Read/Write"| DB
    API <-->|"Session/Cache"| CACHE
    API -->|"Enqueue Jobs"| TASKS

    TASKS -->|"Send WA Message"| WA
    TASKS -->|"Send OTP / SMS"| SMS
    TASKS -->|"Push Notification"| FCM
    TASKS -->|"Send Email"| EMAIL

    WA -->|"Delivery Webhook"| API
    FCM -->|"Push"| CMA
    FCM -->|"Push HIGH priority"| WKA

    WEB -->|"Maps Embed + Places"| GMAPS
    WEB -->|"GA4 Events"| GA4
    WEB -->|"Score Token"| RECAP
    RECAP -->|"Verify Token"| API

    WKA -->|"DigiLocker OAuth"| DL
    DL -->|"Aadhaar XML Callback"| API
    API -->|"Store Verification"| DB

    WA -->|"WhatsApp"| CUST
    WA -->|"WhatsApp"| WORKER
    WA -->|"WhatsApp"| ADMIN
    SMS -->|"OTP SMS"| CUST
    SMS -->|"OTP SMS"| WORKER
    EMAIL -->|"Email"| CUST
    EMAIL -->|"Alert Email"| ADMIN

    style WA fill:#25D366,color:#fff
    style SMS fill:#0088cc,color:#fff
    style FCM fill:#FFCA28,color:#000
    style EMAIL fill:#EA4335,color:#fff
    style GA4 fill:#E37400,color:#fff
    style RECAP fill:#4285F4,color:#fff
    style GMAPS fill:#34A853,color:#fff
    style DL fill:#1a3c8f,color:#fff
    style Backend fill:#f0f4ff,stroke:#4f46e5
    style Clients fill:#fff7ed,stroke:#ea580c
    style Notifications fill:#f0fdf4,stroke:#16a34a
    style KYC fill:#f5f0ff,stroke:#7c3aed
```

---

## INT-001: WhatsApp Business API

**Integration ID:** INT-001  
**Priority:** P0  
**Status:** Required at Launch  
**Category:** Messaging / Notifications

### 1. Purpose

WhatsApp is the primary communication channel for VSolveHub's Tier 2/3 India target market, where WhatsApp penetration exceeds 95%. This integration serves two distinct functions:

| Function | Description |
|---|---|
| **Click-to-Chat** | Entry point on every page — lets customers initiate conversations directly from the web/app |
| **Transactional Notifications** | Automated business messages sent at key lifecycle events (booking, assignment, completion) |

### 2. Provider Options

| Role | Provider | Notes |
|---|---|---|
| **Primary** | [WATI](https://wati.io) | WhatsApp Business API partner, no-code template management, webhook support, India-friendly pricing |
| **Fallback** | [Twilio WhatsApp](https://www.twilio.com/whatsapp) | Global reliability, enterprise SLA, slightly higher per-message cost |

**Failover logic:** If WATI returns a non-2xx response or times out after 5 seconds, Celery automatically retries via the Twilio adapter after a 30-second delay.

### 3. Message Templates

> All outbound business-initiated messages on WhatsApp **must use pre-approved templates**. Template approval via WATI dashboard typically takes 24–72 hours.

#### Template Registry

| ID | Template Name | Recipient | Trigger Event | Category |
|---|---|---|---|---|
| WA-T01 | `booking_confirmed` | Customer | Booking created & payment processed | UTILITY |
| WA-T02 | `worker_assigned` | Customer | Admin assigns a worker to booking | UTILITY |
| WA-T03 | `worker_on_the_way` | Customer | Worker taps "Start Journey" in Worker App | UTILITY |
| WA-T04 | `job_completed_rating` | Customer | Worker marks job as Complete | UTILITY |
| WA-T05 | `new_lead_alert` | Admin | Any new booking is created | UTILITY |
| WA-T06 | `worker_approved` | Worker | Admin approves worker profile | UTILITY |
| WA-T07 | `worker_rejected` | Worker | Admin rejects worker profile | UTILITY |
| WA-T08 | `new_job_alert` | Worker | Admin assigns job or broadcast | UTILITY |

#### Template Message Bodies

```
WA-T01 — booking_confirmed
──────────────────────────────────────────────────────────
Hi {{customer_name}}, ✅

Your booking is *CONFIRMED*!

📋 Booking Ref: *{{booking_ref}}*
🛠️ Service: {{service_name}}
📅 Date: {{service_date}}
⏰ Time: {{service_time}}
📍 Address: {{address}}

We'll notify you once a worker is assigned.
For queries: https://wa.me/919000000000

Thank you for choosing VSolveHub! 🙏

──────────────────────────────────────────────────────────
WA-T02 — worker_assigned
──────────────────────────────────────────────────────────
Hi {{customer_name}}, 👷

Great news! A worker has been assigned to your booking.

📋 Ref: *{{booking_ref}}*
👤 Worker: *{{worker_name}}*
📞 Contact: {{contact_link}}   (masked proxy / in-app chat — NOT the raw worker phone; see conventions.md D-15)
⏱️ ETA: ~{{eta_minutes}} minutes

You'll receive another message when they're on the way.

──────────────────────────────────────────────────────────
WA-T03 — worker_on_the_way
──────────────────────────────────────────────────────────
Hi {{customer_name}}, 🚗

*{{worker_name}}* is on the way to your location!

📋 Ref: *{{booking_ref}}*
⏱️ ETA: ~{{eta_minutes}} minutes

Please ensure someone is available at the address.

──────────────────────────────────────────────────────────
WA-T04 — job_completed_rating
──────────────────────────────────────────────────────────
Hi {{customer_name}}, ✨

Your service is *COMPLETED*!

📋 Ref: *{{booking_ref}}*
🛠️ Service: {{service_name}}
👤 Worker: {{worker_name}}

How was your experience? Rate us:
⭐ {{rating_link}}

Thank you for choosing VSolveHub! 🙏

──────────────────────────────────────────────────────────
WA-T05 — new_lead_alert
──────────────────────────────────────────────────────────
🔔 *New Lead Alert — VSolveHub*

📋 Ref: {{booking_ref}}
👤 Customer: {{customer_name}}
📞 Phone: {{customer_phone}}
🛠️ Service: {{service_name}}
📅 Date: {{service_date}}
📍 Area: {{service_area}}

Action required: Assign a worker → {{admin_link}}

──────────────────────────────────────────────────────────
WA-T06 — worker_approved
──────────────────────────────────────────────────────────
Hi {{worker_name}}, 🎉

*Congratulations!* Your VSolveHub worker profile has been *APPROVED*.

You can now start receiving jobs!

📱 Open the app and set yourself *ONLINE* to begin.
📞 Support: https://wa.me/919000000000

Welcome to the VSolveHub family! 💪

──────────────────────────────────────────────────────────
WA-T07 — worker_rejected
──────────────────────────────────────────────────────────
Hi {{worker_name}},

Unfortunately, your VSolveHub worker profile was *not approved* at this time.

❌ Reason: *{{rejection_reason}}*

📝 You can re-apply after addressing the above:
{{reapply_link}}

For help: https://wa.me/919000000000

──────────────────────────────────────────────────────────
WA-T08 — new_job_alert
──────────────────────────────────────────────────────────
🔔 *New Job Alert!*

⏱️ You have *30 seconds* to accept this job.

🛠️ Service: {{service_name}}
📍 Area: {{service_area}}
📅 Date: {{service_date}}
⏰ Time: {{service_time}}

👉 Open app to Accept or Decline
```

### 4. Integration Flow

#### 4a. Transactional Message Flow (Backend → WhatsApp → User)

```mermaid
sequenceDiagram
    participant App as Django App
    participant Celery as Celery Worker
    participant WATI as WATI API
    participant Twilio as Twilio Fallback
    participant WA as WhatsApp Platform
    participant User as End User

    App->>Celery: Enqueue send_whatsapp_message task<br/>{template_id, recipient_phone, params}
    Celery->>WATI: POST /api/v1/sendTemplateMessage<br/>Authorization: Bearer {token}

    alt WATI Success 2xx
        WATI-->>Celery: 200 OK {message_id, status: "queued"}
        WATI->>WA: Route message
        WA->>User: Deliver WhatsApp message
        WA-->>WATI: Delivery receipt {status: "delivered"}
        WATI-->>App: Webhook POST /webhooks/whatsapp/delivery/<br/>{message_id, status, timestamp}
        App->>App: Update notification_logs record
    else WATI Failure 4xx/5xx or timeout
        WATI-->>Celery: Error response / Timeout
        Celery->>Celery: Log failure, wait 30s
        Celery->>Twilio: POST /2010-04-01/Accounts/{SID}/Messages<br/>From: whatsapp:+14155238886
        Twilio->>WA: Route message
        WA->>User: Deliver WhatsApp message
        Twilio-->>App: Webhook POST /webhooks/twilio/whatsapp/<br/>{MessageSid, MessageStatus}
    end
```

#### 4b. Click-to-Chat Flow (User → WhatsApp)

```mermaid
sequenceDiagram
    participant User as Customer Browser/App
    participant Web as Next.js Web App
    participant WA as WhatsApp App

    User->>Web: Clicks "Chat on WhatsApp" button
    Web->>Web: Generate pre-filled URL:<br/>wa.me/91{number}?text=Hi, I need help with {service}
    Web->>Web: Track GA4 event: whatsapp_click
    Web->>WA: Open wa.me deep link
    WA->>WA: Open chat with pre-filled message
    User->>WA: Send message to VSolveHub
    Note over WA: Conversation handled by<br/>WATI inbox / human agent
```

#### 4c. Delivery Receipt Webhook Flow

```mermaid
sequenceDiagram
    participant WA as WhatsApp Platform
    participant WATI as WATI
    participant Django as Django Webhook Handler
    participant DB as PostgreSQL

    WA->>WATI: Message status update {delivered/read/failed}
    WATI->>Django: POST /api/webhooks/whatsapp/delivery/<br/>X-WATI-Signature: {hmac_sha256}
    Django->>Django: Verify HMAC signature
    Django->>DB: UPDATE message_logs SET status=?, delivered_at=?<br/>WHERE external_message_id=?
    Django->>WATI: 200 OK

    alt Signature Invalid
        Django->>WATI: 403 Forbidden
        Django->>Django: Log security alert
    end
```

### 5. Configuration / Environment Variables

```env
# ─── WATI (Primary) ───────────────────────────────────────────────
WATI_API_ENDPOINT=https://live-mt-server.wati.io/{your-tenant-id}
WATI_API_TOKEN=eyJhbGciOi...                    # Bearer token from WATI dashboard
WATI_WEBHOOK_SECRET=your_hmac_secret_key        # For validating incoming webhook signatures
WATI_BUSINESS_PHONE=919000000000                # WhatsApp Business number (no +)

# ─── Twilio WhatsApp (Fallback) ───────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886      # Twilio sandbox or approved number
TWILIO_WEBHOOK_SECRET=your_twilio_webhook_secret

# ─── Click-to-Chat (Next.js) ─────────────────────────────────────
NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER=919000000000
NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE=Hi, I need help with a service booking.
```

### 6. Error Handling & Fallback

| Scenario | Detection | Handling |
|---|---|---|
| WATI timeout (>5s) | `requests.Timeout` exception | Retry via Twilio after 30s delay |
| WATI 4xx (bad request) | HTTP status 400–499 | Log error, alert admin, do NOT retry |
| WATI 5xx (server error) | HTTP status 500–599 | Exponential backoff: retry 3× (30s, 60s, 120s), then Twilio |
| Invalid phone number | WATI 400 response | Log and skip; trigger SMS fallback if OTP context |
| Template not approved | WATI 400 `template_not_found` | Alert developer immediately; send email fallback |
| Webhook signature mismatch | HMAC check fails | Return 403, log security event, do NOT process |
| Message delivery failed | `status: failed` in webhook | Retry once after 5 minutes; SMS fallback for critical messages |

```python
# backend/notifications/whatsapp.py (simplified adapter pattern)

import requests
from django.conf import settings
from celery import shared_task

@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_whatsapp_template(self, phone: str, template_name: str, params: dict):
    """Send a WhatsApp template message via WATI with Twilio fallback."""
    try:
        resp = requests.post(
            f"{settings.WATI_API_ENDPOINT}/api/v1/sendTemplateMessage",
            json={
                "template_name": template_name,
                "broadcast_name": f"vsolvehub_{template_name}",
                "receivers": [{"whatsappNumber": phone, "customParams": params}],
            },
            headers={"Authorization": f"Bearer {settings.WATI_API_TOKEN}"},
            timeout=5,
        )
        resp.raise_for_status()
        return {"provider": "wati", "message_id": resp.json().get("messageId")}

    except (requests.Timeout, requests.HTTPError) as exc:
        if self.request.retries == self.max_retries:
            # All WATI retries exhausted — switch to Twilio fallback
            return _send_via_twilio(phone, template_name, params)
        raise self.retry(exc=exc)


def _send_via_twilio(phone: str, template_name: str, params: dict) -> dict:
    from twilio.rest import Client
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    body = _render_template_text(template_name, params)   # plain text fallback renderer
    msg = client.messages.create(
        from_=settings.TWILIO_WHATSAPP_FROM,
        to=f"whatsapp:+{phone}",
        body=body,
    )
    return {"provider": "twilio", "message_id": msg.sid}
```

### 7. Cost Estimate

| Cost Item | WATI | Twilio WhatsApp |
|---|---|---|
| Monthly platform fee | ₹4,000–₹6,000/month (Growth plan) | $0 (pay-per-message) |
| Per utility message (India) | ~₹0.40–₹0.60 | ~$0.005 (~₹0.42) |
| Per marketing message (India) | ~₹0.80–₹1.00 | ~$0.008 (~₹0.67) |
| Webhook / inbox UI | Included | Extra (Twilio Flex) |
| **Estimate at 1,000 bookings/month** | ₹4,000 + ₹4,800 msgs ≈ **₹8,800/mo** | ~**₹3,400/mo** (msgs only) |

> **Recommendation:** Start with WATI for its inbox management features and template approval support. Use Twilio purely as a code-level fallback.

### 8. Implementation Notes

#### Django (Backend)

- Create a `notifications` Django app with adapters: `WATIAdapter`, `TwilioAdapter` both implementing a common `WhatsAppAdapter` ABC.
- Use `django-celery-beat` to schedule retry jobs.
- Store every outbound message in the canonical `notification_logs` model (which now carries `provider`, `template_id`, `external_message_id`, `status`, `sent_at`, `delivered_at` — see `conventions.md` D-17; the older `MessageLog` name is superseded).
- Expose webhook endpoints: `POST /api/webhooks/whatsapp/wati/` and `POST /api/webhooks/whatsapp/twilio/`.
- Validate WATI webhooks using HMAC-SHA256 with `WATI_WEBHOOK_SECRET`.
- Gate template sends behind a `FeatureFlag` model so templates can be disabled without deployment.

#### Next.js (Frontend)

```tsx
// components/ui/WhatsAppButton.tsx
"use client";

interface WhatsAppButtonProps {
  service?: string;
  label?: string;
  buttonLocation?: string;
}

export const WhatsAppButton = ({
  service = "a service",
  label = "💬 Chat on WhatsApp",
  buttonLocation = "page",
}: WhatsAppButtonProps) => {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER;
  const text  = encodeURIComponent(`Hi, I need help with ${service}`);
  const href  = `https://wa.me/${phone}?text=${text}`;

  const handleClick = () => {
    // Fire GA4 event (non-blocking)
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "whatsapp_click", {
        service_name: service,
        button_location: buttonLocation,
        page_location: window.location.pathname,
      });
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={handleClick}
      className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg"
    >
      {label}
    </button>
  );
};
```

- Render `WhatsAppButton` in: site header, service detail pages, booking confirmation page, and footer.
- Do NOT expose `WATI_API_TOKEN` to the client — all API calls go through Django REST endpoints.

---

## INT-002: SMS / OTP

**Integration ID:** INT-002  
**Priority:** P0  
**Status:** Required at Launch  
**Category:** Authentication / Verification

> ⚠️ **Normative correction (v1.1) — see `conventions.md` D-03.** This section was
> originally written with SHA-256 hashing, an `OTPRecord` table as the source of truth,
> and a 30-minute lockout. The **canonical** spec is: **bcrypt (cost 12)** hashing,
> **Redis** as the live/authoritative store (`otp_logs` is audit-only), **3 attempts →
> OTP invalidated** (request a new one; fresh send after the 60-second cooldown — **no
> 30-minute lockout**), and **5 sends per phone per hour**. All endpoints are under
> **`/api/v1/`**. The code/sequence samples below are illustrative; where they differ
> from D-03, D-03 wins. Mobile clients protect `otp/send` with Play Integrity / App
> Attest (reCAPTCHA v3 is web-only).

### 1. Purpose

SMS OTP is the sole authentication mechanism for both customers and workers. It replaces passwords entirely, providing a frictionless, phone-number-first login flow that works on any device — including feature phones in Tier 2/3 markets.

### 2. Provider Options

| Role | Provider | Why |
|---|---|---|
| **Primary** | [MSG91](https://msg91.com) | India-first, DLT-compliant, competitive pricing (₹0.12–₹0.18/SMS), excellent delivery rates |
| **Fallback** | [Fast2SMS](https://www.fast2sms.com) | Ultra-cheap India fallback (₹0.10–₹0.15/SMS), DLT support |
| **International** | [Twilio SMS](https://www.twilio.com/sms) | For non-Indian phone numbers (use case: expat workers) |

### 3. OTP Specification

| Parameter | Value |
|---|---|
| Length | 6 digits |
| Character set | Numeric only `[0-9]` |
| Validity | 10 minutes |
| Max attempts | 3 per OTP instance |
| Resend cooldown | 60 seconds |
| Resend max | 5 per phone per hour |
| Storage | **bcrypt (cost 12)**; **Redis** is the live/authoritative store, `otp_logs` table is audit-only (D-03) |
| After expiry | Require new OTP (deleted from Redis on expiry/use) |
| After max attempts | OTP invalidated; request a new one — fresh send allowed after the 60s cooldown (**no 30-min lockout**, D-03) |

#### DLT Compliance (India — TRAI)

> [!IMPORTANT]
> All commercial SMS sent in India **must comply with TRAI's DLT (Distributed Ledger Technology) regulations**. Failure to register results in message blocking by Indian telecom operators.

**Requirements:**

1. Register entity on DLT portal — obtain **Principal Entity ID**
2. Register sender ID (header): e.g., `VSOLVH` — obtain **Header ID**
3. Register every SMS template — obtain **Template ID** per message body
4. Include `Template ID` in every API call to MSG91

**Approved OTP Template:**

```
Template ID: {DLT_TEMPLATE_ID_OTP}
Sender ID:   VSOLVH
Body:        "Your VSolveHub OTP is {#var#}. Valid for 10 minutes. Do not share with anyone. - VSolveHub"
```

### 4. Integration Flow

```mermaid
sequenceDiagram
    participant Client as Client Web/App
    participant Django as Django API
    participant DB as PostgreSQL
    participant Cache as Redis Cache
    participant MSG91 as MSG91 Primary
    participant F2S as Fast2SMS Fallback
    participant Phone as Customer Phone

    Client->>Django: POST /api/v1/auth/otp/send/<br/>{phone: "91XXXXXXXXXX"}
    Django->>Django: Validate phone format E.164
    Django->>Cache: CHECK rate limit key: otp:rl:{phone}<br/>max 5 OTPs per hour

    alt Rate limit exceeded
        Django-->>Client: 429 Too Many Requests<br/>{retry_after: 3600}
    end

    Django->>Django: Generate 6-digit OTP via secrets.randbelow
    Django->>Django: hash = SHA256(otp + phone + secret_salt)
    Django->>DB: INSERT OTPRecord<br/>{phone, hash, expires_at=now+10m, attempts=0, status=PENDING}
    Django->>Cache: SET otp:resend:{phone} TTL=60s

    Django->>MSG91: POST /api/v5/otp<br/>{mobile, otp, template_id, dlt_te_id}

    alt MSG91 Success
        MSG91-->>Django: 200 {type: "success", request_id}
        MSG91->>Phone: SMS delivered
        Django-->>Client: 200 {message: "OTP sent", resend_in: 60}
    else MSG91 Failure
        MSG91-->>Django: Error or Timeout
        Django->>F2S: POST /V3/send-msg<br/>{sender_id, message, language, route, numbers}
        F2S->>Phone: SMS delivered
        Django-->>Client: 200 {message: "OTP sent", resend_in: 60}
    end

    Client->>Django: POST /api/v1/auth/otp/verify/<br/>{phone, otp}
    Django->>DB: SELECT OTPRecord WHERE phone=? AND status=PENDING<br/>AND expires_at > NOW()

    alt OTP not found or expired
        Django-->>Client: 400 {error: "OTP expired or not found"}
    end

    Django->>Django: Verify: SHA256(otp + phone + salt) == stored_hash

    alt Hash mismatch
        Django->>DB: UPDATE attempts++ WHERE id=?
        alt attempts >= 3
            Django->>DB: UPDATE status=LOCKED
            Django-->>Client: 400 {error: "Too many attempts. Request new OTP."}
        else attempts less than 3
            Django-->>Client: 400 {error: "Invalid OTP", attempts_left: N}
        end
    else Hash matches
        Django->>DB: UPDATE status=USED, verified_at=NOW()
        Django->>Django: Create or update User record
        Django->>Django: Generate JWT access + refresh tokens
        Django-->>Client: 200 {access_token, refresh_token, user_id, is_new_user}
    end
```

### 5. Configuration / Environment Variables

```env
# ─── MSG91 (Primary) ─────────────────────────────────────────────
MSG91_AUTH_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxx          # From MSG91 dashboard
MSG91_SENDER_ID=VSOLVH                            # DLT-registered header
MSG91_DLT_ENTITY_ID=your_entity_id               # From TRAI DLT portal
MSG91_DLT_TEMPLATE_ID_OTP=your_otp_template_id  # DLT template ID

# ─── Fast2SMS (Fallback) ─────────────────────────────────────────
FAST2SMS_API_KEY=your_fast2sms_api_key
FAST2SMS_SENDER_ID=VSOLVH
FAST2SMS_DLT_TEMPLATE_ID=your_dlt_template_id

# ─── Twilio SMS (International Fallback) ─────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_SMS_FROM=+1xxxxxxxxxx

# ─── OTP Settings ────────────────────────────────────────────────
OTP_SECRET_SALT=a_long_random_secret_salt_for_hashing
OTP_VALIDITY_MINUTES=10
OTP_MAX_ATTEMPTS=3
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_PER_HOUR=5
OTP_LOCKOUT_MINUTES=30
```

### 6. Error Handling & Fallback

| Scenario | Handling |
|---|---|
| MSG91 timeout | Switch to Fast2SMS; log warning |
| Fast2SMS failure | Switch to Twilio (international) or queue for retry |
| All providers fail | Return 503 with retry guidance; send alert to admin WhatsApp |
| Invalid phone number | Return 400 immediately; do not call provider |
| Non-Indian number (+XX prefix) | Route directly to Twilio, skip MSG91/Fast2SMS |
| OTP expired | Return 400 `otp_expired`; client must request new OTP |
| Max attempts hit | OTP invalidated; request a new OTP (fresh send after 60s cooldown — D-03) |
| Resend before cooldown | Return 429 with `resend_in` seconds remaining |

### 7. Django OTP Model

```python
# backend/authentication/models.py
import hashlib
import secrets
from django.db import models
from django.utils import timezone
from datetime import timedelta
from django.conf import settings


class OTPRecord(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        USED    = "USED"
        EXPIRED = "EXPIRED"
        LOCKED  = "LOCKED"

    phone       = models.CharField(max_length=15, db_index=True)
    otp_hash    = models.CharField(max_length=64)          # SHA-256 hex digest
    status      = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    attempts    = models.SmallIntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    expires_at  = models.DateTimeField()
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["phone", "status", "expires_at"]),
        ]

    @classmethod
    def generate(cls, phone: str) -> tuple["OTPRecord", str]:
        """Create a new OTP record. Returns (record, raw_otp)."""
        raw_otp = str(secrets.randbelow(900000) + 100000)   # 6-digit
        otp_hash = hashlib.sha256(
            f"{raw_otp}{phone}{settings.OTP_SECRET_SALT}".encode()
        ).hexdigest()
        record = cls.objects.create(
            phone=phone,
            otp_hash=otp_hash,
            expires_at=timezone.now() + timedelta(minutes=settings.OTP_VALIDITY_MINUTES),
        )
        return record, raw_otp

    def verify(self, raw_otp: str) -> bool:
        candidate_hash = hashlib.sha256(
            f"{raw_otp}{self.phone}{settings.OTP_SECRET_SALT}".encode()
        ).hexdigest()
        return candidate_hash == self.otp_hash
```

### 8. Cost Estimate

| Volume | MSG91 Cost | Fast2SMS Cost | Twilio Cost |
|---|---|---|---|
| 1,000 OTPs/month | ₹150–₹180 | ₹100–₹150 | $5.00 |
| 5,000 OTPs/month | ₹750–₹900 | ₹500–₹750 | $25.00 |
| 20,000 OTPs/month | ₹2,400–₹3,600 | ₹2,000–₹3,000 | $100.00 |

> **Estimated at launch:** ~1,000–2,000 OTPs/month → **₹200–₹400/month total**

### 9. Next.js Implementation Notes

- Implement a `useOTP` hook managing state machine: `idle → sending → sent → verifying → verified → error`.
- Countdown timer for resend button using `useEffect` with a 60-second interval.
- Mask phone number in UI after OTP is sent — display only last 4 digits.
- Auto-submit when all 6 OTP digit boxes are filled.
- On `is_new_user: true` response, redirect to profile completion flow; otherwise to dashboard.

---

## INT-003: Firebase Cloud Messaging (FCM)

**Integration ID:** INT-003  
**Priority:** P0  
**Status:** Required at Launch  
**Category:** Push Notifications

### 1. Purpose

FCM delivers real-time push notifications to the Flutter Customer App and Worker App. Unlike WhatsApp (async) and SMS (fallback), FCM provides instant, in-app notifications with the ability to wake the device screen — critical for the Worker App's 30-second job acceptance window.

### 2. Provider Options

| Role | Provider | Notes |
|---|---|---|
| **Primary** | Google Firebase Cloud Messaging | Free for all volumes; official Flutter `firebase_messaging` package |
| **Fallback** | App polling | If FCM unavailable, Worker App polls `/api/jobs/pending/` every 30s |

### 3. Notification Catalog

#### Customer App Notifications

| Event | Title | Body | Priority | Data Payload |
|---|---|---|---|---|
| Booking Confirmed | "Booking Confirmed ✅" | "Your {service} booking #{ref} is confirmed for {date}" | NORMAL | `{screen: "booking_detail", booking_id}` |
| Worker Assigned | "Worker Assigned 👷" | "{worker_name} will arrive in ~{eta} mins" | NORMAL | `{screen: "booking_detail", booking_id}` |
| Worker On The Way | "On the way! 🚗" | "{worker_name} is heading to your location" | HIGH | `{screen: "booking_detail", booking_id}` |
| Job Completed | "Service Completed ✨" | "Rate your experience with {worker_name}" | NORMAL | `{screen: "rating", booking_id}` |

#### Worker App Notifications

| Event | Title | Body | Priority | Data Payload |
|---|---|---|---|---|
| New Job Alert | "🔔 New Job — 30s to Accept!" | "{service_name} in {area} on {date}" | **HIGH** | `{screen: "job_alert", job_id, expires_at}` |
| Job Accepted | "Job Confirmed ✅" | "You've accepted the {service_name} job" | NORMAL | `{screen: "my_jobs", job_id}` |
| Reminder: Go Online | "You have pending jobs" | "Set yourself ONLINE to receive job alerts" | NORMAL | `{screen: "home"}` |
| Account Approved | "Account Approved! 🎉" | "You can now receive jobs. Go online!" | HIGH | `{screen: "home"}` |

### 4. Integration Flow

#### 4a. Device Token Registration Flow

```mermaid
sequenceDiagram
    participant App as Flutter App
    participant FCM as Firebase FCM
    participant Django as Django API
    participant DB as PostgreSQL

    App->>FCM: Request FCM token on app launch
    FCM-->>App: Return device FCM token string
    App->>Django: POST /api/v1/devices/fcm/register/<br/>{fcm_token, platform: "android" or "ios", app_type: "customer" or "worker"}
    Django->>DB: UPSERT FCMDevice<br/>{user_id, fcm_token, platform, app_type, is_active=true}
    Django-->>App: 200 OK

    Note over App,FCM: Token Refresh Flow
    FCM->>App: onTokenRefresh() callback fires
    App->>Django: PATCH /api/devices/update-token/<br/>{old_token, new_token}
    Django->>DB: UPDATE FCMDevice SET fcm_token=new_token WHERE fcm_token=old_token
```

#### 4b. Send Push Notification Flow

```mermaid
sequenceDiagram
    participant Trigger as Event Trigger
    participant Django as Django App
    participant Celery as Celery Worker
    participant DB as PostgreSQL
    participant FCM as Firebase Admin SDK
    participant Device as Mobile Device

    Trigger->>Django: State change event e.g. worker assigned
    Django->>Celery: Enqueue send_push_notification task<br/>{user_id, notification_type, data}
    Celery->>DB: SELECT fcm_tokens WHERE user_id=? AND is_active=true
    
    loop For each active device token
        Celery->>FCM: firebase_admin.messaging.send Message<br/>{token, notification, data, android_config, apns_config}

        alt FCM Send Success
            FCM-->>Celery: {name: "projects/.../messages/{msg_id}"}
            FCM->>Device: Push notification delivered
        else Invalid Token UnregisteredError
            FCM-->>Celery: UnregisteredError
            Celery->>DB: UPDATE FCMDevice SET is_active=false WHERE token=?
        else Rate limit QuotaExceededError
            FCM-->>Celery: QuotaExceededError
            Celery->>Celery: Retry after 60s exponential backoff
        end
    end
```

#### 4c. Worker Job Alert — 30-Second Timer Flow

```mermaid
sequenceDiagram
    participant Django as Django API
    participant FCM as Firebase FCM
    participant WkApp as Worker App (Flutter)
    participant Timer as In-App Timer 30s

    Django->>FCM: Send HIGH priority message<br/>{data: {job_id, expires_at, type: "JOB_ALERT"}}
    FCM->>WkApp: Wake device via HIGH priority push
    WkApp->>WkApp: Render Job Alert overlay modal
    WkApp->>Timer: Start 30-second countdown

    alt Worker taps Accept within 30s
        WkApp->>Django: POST /api/jobs/{job_id}/accept/<br/>{worker_id}
        Django->>Django: Validate job still available<br/>and within time window
        Django-->>WkApp: 200 {status: "accepted"}
        WkApp->>Timer: Cancel timer
    else Worker taps Decline
        WkApp->>Django: POST /api/jobs/{job_id}/decline/<br/>{worker_id}
        Django-->>WkApp: 200 {status: "declined"}
        WkApp->>Timer: Cancel timer
    else Timer Expires after 30s
        Timer->>WkApp: Auto-dismiss Job Alert overlay
        WkApp->>Django: POST /api/jobs/{job_id}/timeout/<br/>{worker_id}
        Django->>Django: Mark as no_response<br/>Offer job to next available worker
        Django-->>WkApp: 200 {status: "timed_out"}
    end
```

### 5. Firebase Project Setup

```
Firebase Console Setup Checklist:
──────────────────────────────────
1. Create project: "vsolvehub-production"
2. Add Android app: com.vsolvehub.customer  → Download google-services.json
3. Add Android app: com.vsolvehub.worker    → Download google-services.json
4. Add iOS app:     com.vsolvehub.customer  → Download GoogleService-Info.plist
5. Add iOS app:     com.vsolvehub.worker    → Download GoogleService-Info.plist
6. Generate Service Account key JSON for Firebase Admin SDK (Django)
   Cloud Messaging → Service Accounts → Generate new private key
7. Enable Cloud Messaging API in Google Cloud Console
8. Set FCM message priority defaults in Firebase Console
```

### 6. Configuration / Environment Variables

```env
# ─── Firebase Admin SDK (Django Backend) ─────────────────────────
FIREBASE_PROJECT_ID=vsolvehub-production
FIREBASE_SERVICE_ACCOUNT_JSON=/app/secrets/firebase-service-account.json

# ─── Flutter (bundled in app build — NOT in .env) ────────────────
# Place these files in the correct directories:
#   android/app/google-services.json          (Customer App)
#   android/app/google-services.json          (Worker App)
#   ios/Runner/GoogleService-Info.plist       (Customer App)
#   ios/Runner/GoogleService-Info.plist       (Worker App)
# NEVER commit these credential files to public repositories.
```

### 7. Django Implementation

```python
# backend/notifications/fcm.py
import firebase_admin
from firebase_admin import credentials, messaging
from django.conf import settings
from django.db.models import QuerySet

_firebase_app = None

def _get_firebase_app():
    global _firebase_app
    if _firebase_app is None:
        cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
        _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


def send_push_notification(
    tokens: list[str],
    title: str,
    body: str,
    data: dict = None,
    priority: str = "normal",    # "normal" | "high"
) -> dict:
    _get_firebase_app()

    android_config = messaging.AndroidConfig(
        priority="high" if priority == "high" else "normal",
        notification=messaging.AndroidNotification(
            title=title, body=body, sound="default"
        ),
    )
    apns_config = messaging.APNSConfig(
        headers={"apns-priority": "10" if priority == "high" else "5"},
        payload=messaging.APNSPayload(
            aps=messaging.Aps(
                alert=messaging.ApsAlert(title=title, body=body),
                sound="default",
                content_available=True,
            )
        ),
    )

    results = {"success": [], "failed": [], "invalid_tokens": []}

    for token in tokens:
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            android=android_config,
            apns=apns_config,
        )
        try:
            messaging.send(message)
            results["success"].append(token)
        except messaging.UnregisteredError:
            results["invalid_tokens"].append(token)
            # Deactivate stale token immediately
            FCMDevice.objects.filter(fcm_token=token).update(is_active=False)
        except Exception as exc:
            results["failed"].append({"token": token[:20] + "...", "error": str(exc)})

    return results
```

```python
# backend/notifications/models.py
class FCMDevice(models.Model):
    class Platform(models.TextChoices):
        ANDROID = "android"
        IOS     = "ios"

    class AppType(models.TextChoices):
        CUSTOMER = "customer"
        WORKER   = "worker"

    user       = models.ForeignKey(
        "auth.User", on_delete=models.CASCADE, related_name="fcm_devices"
    )
    fcm_token  = models.TextField(unique=True)
    platform   = models.CharField(max_length=10, choices=Platform.choices)
    app_type   = models.CharField(max_length=10, choices=AppType.choices)
    is_active  = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "is_active"]),
        ]
```

### 8. Error Handling & Fallback

| Error | Cause | Handling |
|---|---|---|
| `UnregisteredError` | App uninstalled or token expired | Mark `FCMDevice.is_active=False` immediately |
| `InvalidArgumentError` | Malformed token format | Log and skip; mark inactive |
| `QuotaExceededError` | Firebase rate limit hit | Retry with exponential backoff (30s, 60s, 120s) |
| `UnavailableError` | Firebase temporary outage | Retry 3× then fall back to WhatsApp notification |
| Multiple devices, partial failure | Some tokens OK, some fail | Log per-token result; clean up invalid tokens |
| App in deep background (Android) | HIGH priority wakes device | Use `data-only` messages for job alert to trigger foreground service |
| Job alert delivery unconfirmed | No accept/decline within 30s | Server-side timer auto-times-out; offer to next worker |

### 9. Cost Estimate

| Tier | Cost |
|---|---|
| FCM send — all volumes | **Free** |
| Firebase project (Spark plan) | **Free** |
| Firebase project (Blaze — pay-as-you-go) | Free FCM + charged only for other Firebase services if used |

> FCM has no per-message cost at any volume. Zero budget impact.

---

## INT-004: Google Maps API

**Integration ID:** INT-004  
**Priority:** P1  
**Status:** Required at Launch  
**Category:** Location Services

### 1. Purpose

| Use Case | API Used | Page / Component |
|---|---|---|
| **Contact Page Map Embed** | Maps Embed API | `/contact` |
| **Booking Form Address Input** | Places API Autocomplete | `/booking` |
| **Service Area Display** | Maps JavaScript API | Service landing pages |
| **Worker Location Tracking** *(future v2)* | Maps JS + Geocoding | Worker App |

### 2. Provider Options

| Role | Provider | Notes |
|---|---|---|
| **Primary** | Google Maps Platform | Industry standard; $200 free credit/month covers launch volumes |
| **Fallback** | OpenStreetMap + Leaflet.js | Free, open-source, no API key required — use for Contact embed if budget constraint |

### 3. APIs Required

| API | Purpose | Billing After Free Tier |
|---|---|---|
| Maps Embed API | Static iframe embed (Contact page) | **Free — always** |
| Maps JavaScript API | Interactive map rendering | $7 per 1,000 map loads |
| Places API (Autocomplete) | Address input in booking form | $2.83 per 1,000 requests |
| Geocoding API | Convert address text → lat/lng | $5 per 1,000 requests |
| Directions API *(future)* | Worker ETA calculation | $5 per 1,000 requests |

### 4. Integration Flow

#### 4a. Address Autocomplete in Booking Form

```mermaid
sequenceDiagram
    participant User as Customer Browser
    participant NextJS as Next.js App
    participant GPlaces as Google Places API
    participant Django as Django API

    User->>NextJS: Types address in booking form field (min 3 chars)
    NextJS->>NextJS: Debounce 300ms
    NextJS->>GPlaces: AutocompleteService.getPlacePredictions()<br/>{input, componentRestrictions: {country: "in"}}
    GPlaces-->>NextJS: Array of place prediction objects
    NextJS->>User: Render dropdown list of suggestions

    User->>NextJS: Selects a suggestion from dropdown
    NextJS->>GPlaces: PlacesService.getDetails()<br/>{placeId, fields: ["formatted_address", "geometry"]}
    GPlaces-->>NextJS: {formatted_address, lat, lng}
    NextJS->>NextJS: Populate hidden fields: latitude, longitude, address_line

    User->>NextJS: Submits booking form
    NextJS->>Django: POST /api/v1/bookings/<br/>{...booking_data, latitude, longitude, formatted_address}
    Django->>Django: Store coordinates for proximity-based worker matching
```

#### 4b. Contact Page Map Embed

```html
<!-- Maps Embed API — FREE, no JavaScript dependency -->
<iframe
  src="https://www.google.com/maps/embed/v1/place?key=NEXT_PUBLIC_GOOGLE_MAPS_API_KEY&q=VSolveHub+Office,Hyderabad&zoom=15"
  width="100%"
  height="400"
  style="border: 0;"
  allowfullscreen
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade">
</iframe>
```

### 5. Configuration / Environment Variables

```env
# ─── Google Maps (Next.js — NEXT_PUBLIC prefix — safe to expose) ─
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...your_api_key

# ─── Key Restrictions (configure in Google Cloud Console) ─────────
# Application restrictions: HTTP referrers
# Allowed referrers:
#   https://vsolvehub.com/*
#   https://www.vsolvehub.com/*
#   https://*.vsolvehub.com/*
#   http://localhost:3000/*              (development only — remove in prod)
#
# API restrictions: Restrict key to ONLY these APIs:
#   Maps JavaScript API
#   Maps Embed API
#   Places API
#   Geocoding API
```

### 6. Next.js Implementation

```tsx
// components/maps/AddressAutocomplete.tsx
"use client";
import { useEffect, useRef } from "react";

interface AddressData {
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface Props {
  onAddressSelect: (data: AddressData) => void;
  placeholder?: string;
}

export const AddressAutocomplete = ({
  onAddressSelect,
  placeholder = "Enter your full address",
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.google || !inputRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "in" },        // India only
      fields: ["formatted_address", "geometry"],
      types: ["geocode", "establishment"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        onAddressSelect({
          formattedAddress: place.formatted_address ?? "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
    });
  }, [onAddressSelect]);

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder}
      className="w-full border rounded-lg px-3 py-2 text-sm"
    />
  );
};
```

```tsx
// app/layout.tsx — Load Maps JS API once, lazily
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
```

### 7. Error Handling & Fallback

| Scenario | Handling |
|---|---|
| API key invalid or quota exceeded | Show plain text `<input>` with no autocomplete; log and alert admin |
| Places Autocomplete fails to load | Fall back to free-text entry; geocode server-side on form submit |
| Map embed fails to load | Show static image of location with full address text |
| User denies browser geolocation | Fall back to city/area selection dropdown |
| Key abuse detected (unusual usage spike) | GCP billing alert fires; temporarily restrict key |

### 8. Cost Estimate

| API | Monthly Free Tier | Cost After Free |
|---|---|---|
| Maps Embed API | Unlimited | **Free** |
| Maps JavaScript API | ~28,500 loads in $200 credit | $7/1,000 loads |
| Places Autocomplete | ~70,700 requests in $200 credit | $2.83/1,000 requests |
| Geocoding | ~40,000 requests in $200 credit | $5/1,000 requests |
| **Estimate at launch** | **Within $200 free credit** | **$0/month** |

> **Action required:** Set GCP billing alert at $100 and hard cap at $200 to prevent unexpected charges.

---

## INT-005: Google Analytics 4 (GA4)

**Integration ID:** INT-005  
**Priority:** P1  
**Status:** Required at Launch  
**Category:** Analytics / Business Intelligence

### 1. Purpose

GA4 tracks the complete user journey from landing page to booking completion, enabling data-driven product decisions, funnel optimization, and marketing ROI measurement for VSolveHub's 8 service categories.

### 2. Provider Options

| Role | Provider | Notes |
|---|---|---|
| **Primary** | Google Analytics 4 | Free, industry standard, integrates with Google Ads & Search Console |
| **Supplementary** | Microsoft Clarity | Free session recordings and heatmaps — add alongside GA4 |

### 3. Event Taxonomy

#### Standard Events (Auto-collected)

| Event | Trigger |
|---|---|
| `page_view` | Every page navigation (configured in AnalyticsProvider) |
| `session_start` | New session begins |
| `first_visit` | First-ever site visit |

#### Custom Events

| Event Name | Trigger | Parameters | No PII Rule |
|---|---|---|---|
| `category_selected` | User taps a service category card | `category_id`, `category_name` | ✅ |
| `service_viewed` | User views service detail page | `service_id`, `service_name`, `category_name`, `price_range` | ✅ |
| `search_performed` | User submits a search query | `search_term`, `results_count` | ✅ |
| `booking_started` | Booking form is opened | `service_id`, `service_name`, `source` | ✅ |
| `booking_submitted` | User submits booking form | `service_id`, `booking_date`, `address_city` | ✅ No full address |
| `booking_confirmed` | OTP verified + booking created in DB | `booking_id`, `service_id`, `booking_value` | ✅ |
| `whatsapp_click` | WhatsApp CTA button tapped | `service_name`, `page_location`, `button_location` | ✅ |
| `otp_requested` | User requests OTP | `user_type: customer or worker` | ✅ |
| `otp_verified` | OTP successfully verified | `user_type`, `is_new_user` | ✅ |
| `worker_registration_started` | Worker opens registration form | — | ✅ |
| `worker_registration_step_completed` | Worker completes a step | `step_number`, `step_name` | ✅ |
| `worker_registration_completed` | Worker profile submitted for review | `skills_count`, `documents_uploaded` | ✅ |
| `rating_submitted` | Customer submits a rating | `rating_value`, `has_review_text` | ✅ |

#### Privacy Rules

- **Zero PII** in any event parameter — no names, phone numbers, email addresses, or full addresses
- Use opaque `booking_id` (not customer name) as booking reference
- Use `address_city` (not street address) for location dimension
- Set `anonymize_ip: true` in gtag config
- Disable Google Signals if only targeting Indian users (reduces cross-device tracking footprint)

### 4. Integration Flow

```mermaid
sequenceDiagram
    participant User as User Browser
    participant NextJS as Next.js App
    participant GA4 as Google Analytics 4

    User->>NextJS: Navigates to any page
    NextJS->>GA4: gtag config G-XXXXXXXX<br/>{page_path, anonymize_ip: true}
    GA4-->>NextJS: ACK async fire-and-forget

    User->>NextJS: Selects service category
    NextJS->>GA4: gtag event category_selected<br/>{category_id, category_name}

    User->>NextJS: Opens booking form
    NextJS->>GA4: gtag event booking_started<br/>{service_id, service_name, source}

    User->>NextJS: Submits booking form
    NextJS->>GA4: gtag event booking_submitted<br/>{service_id, booking_date, address_city}

    Note over NextJS: OTP flow and API call to Django

    NextJS->>GA4: gtag event booking_confirmed<br/>{booking_id, service_id, booking_value}
    Note over GA4: booking_confirmed is a Conversion<br/>with booking_value for Google Ads ROAS
```

### 5. Configuration / Environment Variables

```env
# ─── Google Analytics 4 (Next.js — PUBLIC) ───────────────────────
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

### 6. Next.js Implementation

```typescript
// lib/analytics/gtag.ts
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID!;

export const pageview = (url: string): void => {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("config", GA_MEASUREMENT_ID, { page_path: url });
};

type EventParams = Record<string, string | number | boolean>;

export const event = (action: string, params: EventParams = {}): void => {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", action, params);
};

// ── Typed event helpers — no PII enforced by TypeScript signatures ──

export const trackCategorySelected = (categoryId: string, categoryName: string) =>
  event("category_selected", { category_id: categoryId, category_name: categoryName });

export const trackServiceViewed = (
  serviceId: string,
  serviceName: string,
  categoryName: string,
  priceRange: string
) => event("service_viewed", { service_id: serviceId, service_name: serviceName,
    category_name: categoryName, price_range: priceRange });

export const trackBookingStarted = (
  serviceId: string,
  serviceName: string,
  source: string
) => event("booking_started", { service_id: serviceId, service_name: serviceName, source });

export const trackBookingConfirmed = (
  bookingId: string,
  serviceId: string,
  bookingValue: number
) => event("booking_confirmed", {
    booking_id: bookingId, service_id: serviceId, booking_value: bookingValue
  });

export const trackWhatsAppClick = (
  serviceName: string,
  pageLocation: string,
  buttonLocation: string
) => event("whatsapp_click", {
    service_name: serviceName, page_location: pageLocation, button_location: buttonLocation
  });

export const trackSearchPerformed = (searchTerm: string, resultsCount: number) =>
  event("search_performed", { search_term: searchTerm, results_count: resultsCount });

export const trackWorkerRegistrationCompleted = (
  skillsCount: number,
  documentsUploaded: number
) => event("worker_registration_completed", {
    skills_count: skillsCount, documents_uploaded: documentsUploaded
  });
```

```tsx
// components/analytics/GoogleAnalytics.tsx
import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/gtag";

export const GoogleAnalytics = () => (
  <>
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="afterInteractive"
    />
    <Script id="gtag-init" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_MEASUREMENT_ID}', {
          page_path: window.location.pathname,
          send_page_view: false,
          anonymize_ip: true,
          allow_google_signals: false,
        });
      `}
    </Script>
  </>
);
```

```tsx
// providers/AnalyticsProvider.tsx — Route change tracking for App Router
"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { pageview } from "@/lib/analytics/gtag";

export const AnalyticsProvider = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  useEffect(() => { pageview(pathname); }, [pathname]);
  return <>{children}</>;
};
```

### 7. GA4 Conversion Goals

Configure these as **Conversions** in the GA4 dashboard (Admin → Events → Mark as conversion):

| Conversion Name | GA4 Event | Value Signal |
|---|---|---|
| Booking Completed | `booking_confirmed` | `booking_value` param |
| WhatsApp Lead Generated | `whatsapp_click` | Fixed: ₹50 |
| Worker Registered | `worker_registration_completed` | Fixed: ₹200 |
| OTP Verified (New User) | `otp_verified` with `is_new_user: true` | — |

### 8. Cost Estimate

| Service | Cost |
|---|---|
| Google Analytics 4 | **Free** |
| GA4 360 (enterprise sampling-free) | $50,000+/year — not needed at launch |
| Microsoft Clarity (session recording) | **Free** |

---

## INT-006: Email SMTP

**Integration ID:** INT-006  
**Priority:** P1  
**Status:** Required at Launch  
**Category:** Transactional Email

### 1. Purpose

Email serves as a secondary notification channel and formal paper trail for bookings. While WhatsApp is the primary channel for Indian users, email ensures business-grade communication for admin alerts and provides a fallback when WhatsApp or SMS fails.

### 2. Provider Options

| Role | Provider | Notes |
|---|---|---|
| **Primary** | [SendGrid](https://sendgrid.com) | Reliable, excellent deliverability, 100 free emails/day |
| **Fallback** | [Mailgun](https://www.mailgun.com) | 5,000 free emails/month for 3 months; full django-anymail support |

### 3. Email Catalog

| ID | Email | Recipient | Trigger | Priority |
|---|---|---|---|---|
| EM-01 | Booking Confirmation | Customer | Booking created in DB | P0 |
| EM-02 | New Lead Alert | Admin Team | Any new booking created | P0 |
| EM-03 | Worker Approved | Worker | Admin approves worker profile | P1 |
| EM-04 | Worker Rejected | Worker | Admin rejects worker profile | P1 |

### 4. Email Templates

```
EM-01 — Booking Confirmation (to Customer)
Subject: ✅ Booking Confirmed — #{{booking_ref}} | VSolveHub
──────────────────────────────────────────────────────────
[Header: VSolveHub logo, brand green #25D366]

Hi {{customer_name}},

Your booking has been confirmed! Here are the details:

┌──────────────────────────────────────────────────────┐
│  Booking Reference:  {{booking_ref}}                 │
│  Service:            {{service_name}}                │
│  Date & Time:        {{service_date}} at {{time}}    │
│  Address:            {{address}}                     │
│  Status:             ✅ Confirmed                    │
└──────────────────────────────────────────────────────┘

[CTA Button: "Track Your Booking"  →  booking detail URL]
[CTA Button: "Contact via WhatsApp"]

Need help? Reply to this email or WhatsApp us at +91 XXXXXXXXXX.

[Footer: Unsubscribe | Privacy Policy | © 2026 VSolveHub]

──────────────────────────────────────────────────────────
EM-02 — New Lead Alert (to Admin Team)
Subject: 🔔 New Lead: {{service_name}} — {{customer_name}} | {{booking_date}}
──────────────────────────────────────────────────────────
[Compact HTML table with all booking fields]
[CTA Button: "Assign Worker" → admin dashboard direct URL]
[Quick stats row: Today's total bookings, Pending assignments count]

──────────────────────────────────────────────────────────
EM-03 — Worker Approved (to Worker)
Subject: 🎉 Your VSolveHub Account is Approved!
──────────────────────────────────────────────────────────
[Warm congratulations opening]

Next steps to start earning:
  1. Open the VSolveHub Worker App
  2. Complete your profile if any fields are missing
  3. Set yourself ONLINE to start receiving job alerts
  4. Pro tips for your first job

[CTA Button: "Open Worker App"  →  deep link to worker app]
[CTA: Support WhatsApp link]

──────────────────────────────────────────────────────────
EM-04 — Worker Rejected (to Worker)
Subject: Update on Your VSolveHub Application
──────────────────────────────────────────────────────────
[Empathetic, solution-focused tone — NOT a rejection letter]

Rejection reason: {{rejection_reason}}

Here is what you can do:
  • {{action_item_1}}
  • {{action_item_2}}

[CTA Button: "Re-apply Now"  →  worker registration URL]
[CTA Button: "Contact Support"  →  WhatsApp link]
```

### 5. Integration Flow

```mermaid
sequenceDiagram
    participant Django as Django App
    participant Celery as Celery Worker
    participant Anymail as django-anymail Library
    participant SendGrid as SendGrid API
    participant Mailgun as Mailgun Fallback
    participant Inbox as Recipient Email Inbox

    Django->>Celery: Enqueue send_transactional_email task<br/>{template_id, recipient, context_dict}
    Celery->>Anymail: EmailMultiAlternatives.send()<br/>using configured EMAIL_BACKEND
    Anymail->>SendGrid: POST /v3/mail/send<br/>Authorization: Bearer SENDGRID_API_KEY

    alt SendGrid Success 202
        SendGrid-->>Anymail: 202 Accepted
        SendGrid->>Inbox: Deliver email
    else SendGrid Failure 4xx or 5xx
        SendGrid-->>Anymail: Error response
        Celery->>Celery: Switch EMAIL_BACKEND to Mailgun adapter
        Celery->>Mailgun: POST api.mailgun.net/v3/{domain}/messages
        Mailgun->>Inbox: Deliver email
    end
```

### 6. Configuration / Environment Variables

```env
# ─── SendGrid (Primary) ───────────────────────────────────────────
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_BACKEND=anymail.backends.sendgrid.EmailBackend
DEFAULT_FROM_EMAIL=noreply@vsolvehub.com
SERVER_EMAIL=alerts@vsolvehub.com
ADMIN_EMAIL_LIST=admin@vsolvehub.com,ops@vsolvehub.com

# ─── Mailgun (Fallback) ───────────────────────────────────────────
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_SENDER_DOMAIN=mg.vsolvehub.com

# ─── Anymail Shared ───────────────────────────────────────────────
ANYMAIL_WEBHOOK_SECRET=your_anymail_webhook_validation_secret
```

### 7. Django Setup

```python
# config/settings.py — Email configuration
INSTALLED_APPS += ["anymail"]

ANYMAIL = {
    "SENDGRID_API_KEY": env("SENDGRID_API_KEY"),
    "MAILGUN_API_KEY":  env("MAILGUN_API_KEY"),
    "MAILGUN_SENDER_DOMAIN": env("MAILGUN_SENDER_DOMAIN"),
    "WEBHOOK_SECRET":   env("ANYMAIL_WEBHOOK_SECRET"),
}

EMAIL_BACKEND    = env("EMAIL_BACKEND", default="anymail.backends.sendgrid.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")
```

```python
# backend/notifications/email.py
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from celery import shared_task
from django.conf import settings

TEMPLATE_CONFIG = {
    "booking_confirmation": {
        "subject_tpl": "✅ Booking Confirmed — #{booking_ref} | VSolveHub",
        "html": "emails/booking_confirmation.html",
        "txt":  "emails/booking_confirmation.txt",
    },
    "new_lead_alert": {
        "subject_tpl": "🔔 New Lead: {service_name} — {customer_name} | {booking_date}",
        "html": "emails/new_lead_alert.html",
        "txt":  "emails/new_lead_alert.txt",
    },
    "worker_approved": {
        "subject_tpl": "🎉 Your VSolveHub Account is Approved!",
        "html": "emails/worker_approved.html",
        "txt":  "emails/worker_approved.txt",
    },
    "worker_rejected": {
        "subject_tpl": "Update on Your VSolveHub Application",
        "html": "emails/worker_rejected.html",
        "txt":  "emails/worker_rejected.txt",
    },
}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_transactional_email(self, template_id: str, recipient: str, context: dict):
    config = TEMPLATE_CONFIG[template_id]
    subject = config["subject_tpl"].format(**context)

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=render_to_string(config["txt"], context),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[recipient],
        )
        msg.attach_alternative(render_to_string(config["html"], context), "text/html")
        msg.send()
    except Exception as exc:
        raise self.retry(exc=exc)
```

### 8. DNS & Deliverability Setup

> [!IMPORTANT]
> Without SPF, DKIM, and DMARC configured on your DNS, transactional emails will land in spam. Complete all DNS records before going live.

```dns
# ─── SPF Record ───────────────────────────────────────────────────
vsolvehub.com   TXT   "v=spf1 include:sendgrid.net include:mailgun.org ~all"

# ─── DKIM (SendGrid provides these CNAME records) ─────────────────
em1234.vsolvehub.com                CNAME   u1234.wl.sendgrid.net
s1._domainkey.vsolvehub.com         CNAME   s1.domainkey.u1234.wl.sendgrid.net
s2._domainkey.vsolvehub.com         CNAME   s2.domainkey.u1234.wl.sendgrid.net

# ─── DMARC Record ─────────────────────────────────────────────────
_dmarc.vsolvehub.com  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@vsolvehub.com; pct=100"

# ─── Mailgun Subdomain Records (fallback routing) ─────────────────
mg.vsolvehub.com      MX    10   mxa.mailgun.org
mg.vsolvehub.com      MX    10   mxb.mailgun.org
mg.vsolvehub.com      TXT        "v=spf1 include:mailgun.org ~all"
k1._domainkey.mg.vsolvehub.com  TXT  {dkim_key from mailgun dashboard}
```

### 9. Error Handling & Fallback

| Scenario | Handling |
|---|---|
| SendGrid 4xx (bad API key) | Alert developer immediately; auto-switch to Mailgun backend |
| SendGrid 5xx (server error) | Retry 3× with 60s delay; fall back to Mailgun |
| Email hard bounce (permanent) | Mark user `email_invalid=True` via anymail webhook; stop sending |
| Email soft bounce (temporary) | Retry delivery; log; alert after 3 consecutive soft bounces |
| User has no email address | Skip email silently; WhatsApp/SMS is primary channel |
| Spam complaint received | Remove from all email lists immediately via anymail webhook handler |
| DKIM failure | Email lands in spam; resolve DNS immediately; monitor via DMARC reports |

### 10. Cost Estimate

| Volume | SendGrid | Mailgun |
|---|---|---|
| 0–100 emails/day | **Free (Essentials free tier)** | Flex: ~$0.80/1,000 |
| Up to 40,000/month | Essentials: $19.95/month | Growth: $15/month |
| **Estimated at launch** | **Within free tier** | **$0/month** |

---

## INT-007: reCAPTCHA v3

**Integration ID:** INT-007  
**Priority:** P1  
**Status:** Required at Launch  
**Category:** Security / Anti-Spam

### 1. Purpose

reCAPTCHA v3 provides invisible bot protection on all public-facing forms without adding friction for legitimate users. Unlike v2 (image challenge), v3 runs silently in the background and returns a risk score (0.0–1.0) that Django uses to accept, flag, or reject the submission.

| Protected Form | Risk If Unprotected |
|---|---|
| Booking form | Bot bookings filling worker capacity with fake jobs |
| Contact form | Spam flood to admin inbox |
| Worker registration | Fake worker profiles created at scale |
| OTP request endpoint | OTP bombing to exhaust SMS provider budget |

### 2. Provider Options

| Role | Provider | Notes |
|---|---|---|
| **Primary** | Google reCAPTCHA v3 | Free up to 1M assessments/month, invisible UX, score-based |
| **Fallback** | Django + Redis rate limiting | Automatic when reCAPTCHA API is unreachable |

### 3. Score Thresholds

| Score Range | Classification | Action |
|---|---|---|
| 0.8 – 1.0 | Very likely human | Process normally |
| 0.5 – 0.79 | Likely human | Process normally |
| 0.3 – 0.49 | Suspicious | Process but flag `is_suspicious=True`; admin review queue |
| 0.0 – 0.29 | Very likely bot | Reject with generic error; log; do not reveal reason |

**Threshold setting:** `RECAPTCHA_SCORE_THRESHOLD=0.5` (accept ≥ 0.5, flag 0.3–0.49, reject < 0.3)

### 4. Integration Flow

```mermaid
sequenceDiagram
    participant User as User Browser
    participant NextJS as Next.js App
    participant GRC as Google reCAPTCHA API
    participant Django as Django API
    participant Redis as Redis Cache

    User->>NextJS: Fills out booking form and clicks Submit
    NextJS->>GRC: grecaptcha.execute SITE_KEY<br/>{action: "booking_submit"}
    GRC-->>NextJS: reCAPTCHA token string 2-minute TTL
    NextJS->>Django: POST /api/v1/bookings/<br/>{...form_data, recaptcha_token: "token"}

    Django->>GRC: POST www.google.com/recaptcha/api/siteverify<br/>{secret: SECRET_KEY, response: token}
    GRC-->>Django: {success: true, score: 0.9, action: "booking_submit"}

    alt Score is 0.5 or above — human
        Django->>Django: Process form normally
        Django-->>NextJS: 200 Success response
    else Score is 0.3 to 0.49 — suspicious
        Django->>Django: Process but flag as is_suspicious=True<br/>Add to admin review queue
        Django-->>NextJS: 200 Success do not reveal flagging to bot
    else Score below 0.3 — likely bot
        Django->>Django: Reject submission; log bot attempt
        Django-->>NextJS: 400 {error: "Request could not be verified. Please try again."}
    else reCAPTCHA API unreachable timeout
        Django->>Redis: CHECK IP rate limit key: ip:{client_ip}:bookings<br/>max 5 per hour
        alt Within rate limit
            Django->>Django: Process form in degraded mode; log warning
            Django-->>NextJS: 200 Success
        else Rate limit exceeded
            Django-->>NextJS: 429 Too Many Requests
        end
    end
```

### 5. Configuration / Environment Variables

```env
# ─── reCAPTCHA v3 ─────────────────────────────────────────────────
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lc...your_site_key    # PUBLIC — safe to expose in browser
RECAPTCHA_SECRET_KEY=6Lc...your_secret_key            # PRIVATE — Django only, never expose
RECAPTCHA_SCORE_THRESHOLD=0.5
RECAPTCHA_TIMEOUT_SECONDS=5
```

### 6. Next.js Implementation

```typescript
// hooks/useRecaptcha.ts
"use client";
import { useCallback } from "react";

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export const useRecaptcha = () => {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!;

  const getToken = useCallback(
    (action: string): Promise<string> =>
      new Promise((resolve, reject) => {
        if (typeof window === "undefined" || !window.grecaptcha) {
          // reCAPTCHA not loaded — return empty string to trigger server-side fallback
          resolve("");
          return;
        }
        window.grecaptcha.ready(async () => {
          try {
            const token = await window.grecaptcha.execute(siteKey, { action });
            resolve(token);
          } catch (err) {
            resolve("");   // Fail open; server handles via rate limiting fallback
          }
        });
      }),
    [siteKey]
  );

  return { getToken };
};
```

```tsx
// Usage example in BookingForm.tsx
const { getToken } = useRecaptcha();

const handleSubmit = async (formData: BookingFormData) => {
  const recaptchaToken = await getToken("booking_submit");
  await createBooking({ ...formData, recaptcha_token: recaptchaToken });
};
```

```tsx
// app/layout.tsx — Load reCAPTCHA script once
import Script from "next/script";

// Inside RootLayout:
<Script
  src={`https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`}
  strategy="afterInteractive"
/>
```

### 7. Django Implementation

```python
# backend/utils/recaptcha.py
import requests
from django.conf import settings

VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


def verify_recaptcha(token: str, expected_action: str | None = None) -> dict:
    """
    Verifies a reCAPTCHA v3 token.

    Returns one of:
        {"valid": True,  "score": 0.9}
        {"valid": False, "score": 0.2, "error": "low_score"}
        {"valid": None,  "error": "api_unavailable"}   # Use fallback
    """
    if not token:
        return {"valid": None, "error": "missing_token"}

    try:
        resp = requests.post(
            VERIFY_URL,
            data={
                "secret": settings.RECAPTCHA_SECRET_KEY,
                "response": token,
            },
            timeout=settings.RECAPTCHA_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success"):
            return {"valid": False, "score": 0.0, "error": "verification_failed"}

        if expected_action and data.get("action") != expected_action:
            return {"valid": False, "score": data.get("score", 0.0), "error": "action_mismatch"}

        score     = data.get("score", 0.0)
        threshold = float(settings.RECAPTCHA_SCORE_THRESHOLD)

        return {
            "valid": score >= threshold,
            "score": score,
            "error": None if score >= threshold else "low_score",
        }

    except requests.Timeout:
        return {"valid": None, "error": "api_unavailable"}
    except Exception as exc:
        return {"valid": None, "error": "api_error", "detail": str(exc)}
```

```python
# backend/bookings/views.py — Using reCAPTCHA in a view
from utils.recaptcha import verify_recaptcha
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response


class BookingCreateView(APIView):
    def post(self, request):
        token = request.data.get("recaptcha_token", "")
        result = verify_recaptcha(token, expected_action="booking_submit")

        if result["valid"] is None:
            # reCAPTCHA API is down — fall back to IP rate limiting
            ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", ""))
            cache_key = f"booking_ratelimit:{ip}"
            count = cache.get(cache_key, 0)
            if count >= 5:
                return Response({"error": "Too many requests. Please try again later."}, status=429)
            cache.set(cache_key, count + 1, timeout=3600)

        elif result["valid"] is False and result.get("score", 1.0) < 0.3:
            return Response(
                {"error": "Request could not be verified. Please try again."},
                status=400,
            )

        # Process the booking (suspicious flag handled inside serializer)
        is_suspicious = result.get("score", 1.0) < 0.5
        # ... serializer.save(is_suspicious=is_suspicious)
```

### 8. Error Handling & Fallback

| Scenario | Handling |
|---|---|
| reCAPTCHA API timeout (>5s) | Fall back to Redis IP rate limiting (5 requests/hour/IP) |
| Token expired (>2 minutes old) | Google returns `timeout-or-duplicate`; client must generate new token |
| Score < 0.3 | Reject with generic error — never reveal the reason to the submitter |
| Score 0.3–0.49 | Accept but flag `is_suspicious=True`; add to admin moderation queue |
| Token missing or empty | Treat as API unavailable; apply rate limiting |
| reCAPTCHA script fails to load | `getToken()` returns empty string; server applies rate limiting fallback |

### 9. Cost Estimate

| Service | Cost |
|---|---|
| reCAPTCHA v3 (standard) | **Free** up to 1,000,000 assessments/month |
| reCAPTCHA Enterprise | $1 per 1,000 assessments after free tier — not needed at launch |

---

## INT-008: DigiLocker (Aadhaar Verification)

**Integration ID:** INT-008  
**Priority:** P0  
**Status:** Required at Launch  
**Category:** Identity & KYC

---

### 1. Purpose

DigiLocker is India's official government digital document platform operated by the Ministry of Electronics and Information Technology (MeitY). It allows citizens to share digitally signed, government-issued documents directly with verified service providers via OAuth 2.0.

VSolveHub uses DigiLocker exclusively for **worker Aadhaar verification** during onboarding. Instead of workers photographing and uploading their Aadhaar card (which is error-prone and requires admin visual review), the worker authorises DigiLocker to share their Aadhaar data directly with VSolveHub. The document arrives pre-verified — no admin needs to visually inspect it.

| What DigiLocker Replaces | What It Does NOT Replace |
|---|---|
| Manual Aadhaar front/back photo upload | OTP-based phone authentication |
| Admin visually reviewing Aadhaar image quality | Selfie / liveness capture |
| Risk of blurry, cropped, or fake document uploads | Bank / UPI details entry |
| Manual Aadhaar number entry and encryption | Skill certificate upload |
| | Admin final approve / reject decision |

---

### 2. Provider

| Role | Provider | Notes |
|---|---|---|
| **Primary** | [DigiLocker Partner API](https://partners.digitallocker.gov.in) | Official MeitY platform; required partnership approval |
| **Fallback** | Manual Aadhaar upload (original flow) | Used when DigiLocker is unavailable or worker skips |

> **Partnership requirement:** VSolveHub must register as a verified Requester Organisation on the DigiLocker Partner Portal. Approval typically takes 2–4 weeks and requires MOU signing with MeitY.

---

### 3. Documents Retrieved

| Document | DigiLocker URI | Fields Extracted |
|---|---|---|
| e-Aadhaar (XML) | `in.gov.uidai.aadhaar` | Full name, date of birth, gender, address, Aadhaar last-4 digits, photo |
| Driving Licence *(optional, future)* | `in.gov.morth.driving-licence` | DL number, validity, name |

> At launch, only **e-Aadhaar** is fetched. Other documents are scoped for future use.

---

### 4. How It Works — Overview

The DigiLocker flow is initiated from within the Worker App during Stage 4 of onboarding (Document Upload). It uses a standard OAuth 2.0 Authorization Code flow:

1. Worker taps **"Verify Aadhaar via DigiLocker"** in the Worker App
2. Worker App requests an auth URL from the VSolveHub backend
3. Backend generates a `state` token (CSRF protection), stores it, and returns the DigiLocker authorization URL
4. Worker App opens the URL in an in-app browser (WebView)
5. Worker logs in to DigiLocker using their Aadhaar number + OTP (DigiLocker's own OTP — separate from VSolveHub's login OTP)
6. Worker reviews and grants consent to share e-Aadhaar with VSolveHub
7. DigiLocker redirects back to VSolveHub's callback URL with an authorization `code`
8. VSolveHub backend exchanges the `code` for an access token
9. Backend fetches the Aadhaar XML document using the access token
10. Backend parses, validates, and stores the verified Aadhaar data
11. Worker App shows **"✅ Aadhaar Verified"** and proceeds to next step

---

### 5. Integration Flow

#### 5a. DigiLocker OAuth Authorization Flow

```mermaid
sequenceDiagram
    participant WkApp as Worker App
    participant Django as Django API
    participant DB as PostgreSQL
    participant DL as DigiLocker API
    participant Aadhaar as UIDAI / Aadhaar

    WkApp->>Django: GET /api/v1/workers/digilocker/auth-url/
    Django->>Django: Generate state token (UUID); store in DB with worker_id + expiry
    Django-->>WkApp: { auth_url: "https://api.digitallocker.gov.in/public/oauth2/1/authorize?..." }

    WkApp->>DL: Open auth_url in in-app WebView
    DL->>DL: Show DigiLocker login screen
    Note over DL: Worker enters Aadhaar number
    DL->>Aadhaar: Request OTP to worker's Aadhaar-linked mobile
    Aadhaar->>WkApp: OTP delivered via SMS (separate from VSolveHub OTP)
    Note over DL: Worker enters OTP + grants consent to share e-Aadhaar
    DL->>DL: Worker reviews consent screen

    DL-->>Django: Redirect to /api/v1/workers/digilocker/callback/?code={auth_code}&state={state_token}
    Django->>Django: Validate state token (matches stored token; not expired)
    Django->>DL: POST /public/oauth2/1/token exchange {code, client_id, client_secret, redirect_uri}
    DL-->>Django: { access_token, token_type, expires_in, refresh_token }

    Django->>DL: GET /public/oauth2/1/xml/eaadhaar (Authorization: Bearer access_token)
    DL-->>Django: e-Aadhaar XML (digitally signed by UIDAI)

    Django->>Django: Parse XML: extract name, dob, gender, last-4, photo
    Django->>Django: Validate XML signature (UIDAI public key)
    Django->>DB: INSERT digilocker_verifications (worker_id, verified=true, verified_at)
    Django->>DB: UPDATE worker_kyc (aadhaar_last4, aadhaar_verified=true, aadhaar_verified_via='DIGILOCKER')
    Django-->>WkApp: WebView redirect closes → { status: "verified", name, aadhaar_last4 }
    WkApp->>WkApp: Show ✅ Aadhaar Verified with name auto-populated
```

#### 5b. Fallback Flow — DigiLocker Unavailable or Skipped

```mermaid
flowchart TD
    A[Worker taps 'Verify Aadhaar via DigiLocker'] --> B{DigiLocker reachable?}
    B -->|Yes| C[OAuth flow proceeds — see 5a]
    B -->|No / timeout| D[Show: 'DigiLocker is temporarily unavailable']
    D --> E['Upload Aadhaar manually instead' button shown]
    E --> F[Original upload flow: Aadhaar front + back photo]
    F --> G[Admin must visually review during verification queue]

    A --> H{Worker taps 'Skip — upload manually'}
    H --> F
```

> **Policy:** Manual upload is always available as a fallback but flags the worker's profile in the admin verification queue with `aadhaar_verified_via = 'MANUAL'`. Admin sees this label and knows visual document review is required.

---

### 6. Admin View — DigiLocker vs Manual

When admin reviews a worker in the Verification Queue:

| Scenario | What Admin Sees |
|---|---|
| DigiLocker verified | ✅ **Aadhaar Verified via DigiLocker** — Name · Last-4 · Verified at timestamp. No document images to review. |
| Manual upload | ⚠️ **Aadhaar uploaded manually** — Aadhaar Front and Back image thumbnails displayed for admin visual review |

This distinction eliminates the majority of admin document review time. Workers who use DigiLocker only require admin approval of skills, selfie, and service area — not document authenticity.

---

### 7. Configuration / Environment Variables

```
# ─── DigiLocker Partner API ───────────────────────────────────────
DIGILOCKER_CLIENT_ID         = your_partner_client_id
DIGILOCKER_CLIENT_SECRET     = your_partner_client_secret
DIGILOCKER_REDIRECT_URI      = https://api.vsolvehub.com/api/v1/workers/digilocker/callback/
DIGILOCKER_BASE_URL          = https://api.digitallocker.gov.in
DIGILOCKER_AUTH_URL          = https://api.digitallocker.gov.in/public/oauth2/1/authorize
DIGILOCKER_TOKEN_URL         = https://api.digitallocker.gov.in/public/oauth2/1/token
DIGILOCKER_AADHAAR_DOC_URI   = in.gov.uidai.aadhaar-verify
DIGILOCKER_STATE_TTL_SECONDS = 300
```

---

### 8. API Endpoints (Django)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/workers/digilocker/auth-url/` | Generate OAuth auth URL + state token for worker |
| `GET` | `/api/v1/workers/digilocker/callback/` | Handle OAuth callback, exchange code, fetch Aadhaar XML |
| `GET` | `/api/v1/workers/digilocker/status/` | Check current DigiLocker verification status for a worker |

All endpoints require the worker to be authenticated (valid JWT). The callback endpoint additionally validates the `state` parameter against the stored token.

---

### 9. Error Handling & Fallback

| Scenario | Handling |
|---|---|
| Worker denies consent on DigiLocker | Redirect back to app with `error=access_denied`; show option to upload manually |
| DigiLocker API timeout (> 10s) | Show "DigiLocker is unavailable right now"; offer manual upload fallback |
| State token expired (> 5 minutes) | Return error; worker must restart the DigiLocker flow |
| State token mismatch (CSRF) | Reject callback with 400; log security event |
| Aadhaar XML signature invalid | Reject; log; treat as failed verification; offer manual upload |
| Worker under 18 (DOB check from Aadhaar XML) | Reject onboarding with clear message: "You must be 18 or older to register as a worker" |
| DigiLocker returns mismatched name | Accept XML; flag for admin review — admin cross-checks against selfie |
| Access token expired before document fetch | Return error; worker restarts OAuth flow |

---

### 10. Security & Compliance

| Requirement | Implementation |
|---|---|
| Aadhaar data minimisation | Only store Aadhaar last-4 digits and verification status. Full Aadhaar number is NOT stored. |
| e-Aadhaar XML signature | Validated against UIDAI's public key before any data is extracted |
| State token (CSRF) | Single-use UUID generated per OAuth initiation; expires in 5 minutes |
| Access token storage | DigiLocker access tokens are not persisted after document fetch; used once and discarded |
| Aadhaar Act compliance | VSolveHub does not use Aadhaar number for authentication — only for identity verification during onboarding |
| DPDP Act 2023 | Worker consent is captured explicitly on the DigiLocker consent screen (MeitY-controlled); VSolveHub receives only the consented data |

---

### 11. Cost Estimate

| Item | Cost |
|---|---|
| DigiLocker Partner API usage | **Free** — no per-request charges for verified partner organisations |
| MeitY partnership registration | One-time administrative process (no monetary fee) |
| **Estimated ongoing cost** | **₹0 / month** |

---

## Environment Variable Master Reference

Complete reference of all environment variables across all integrations. Organize secrets management by environment (development / staging / production).

### Django Backend (`.env`)

```env
# =============================================================
# VSOLVEHUB — DJANGO BACKEND ENVIRONMENT VARIABLES
# =============================================================
# ⚠️  NEVER commit this file to version control.
# Use AWS Secrets Manager or GCP Secret Manager in production.
# =============================================================

# ── Application Core ─────────────────────────────────────────
DJANGO_SECRET_KEY=your-50-char-random-secret-key-here
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=vsolvehub.com,www.vsolvehub.com,api.vsolvehub.com

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://vsolvehub_user:password@localhost:5432/vsolvehub_db

# ── Cache & Queue ────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# ── INT-001: WhatsApp WATI ────────────────────────────────────
WATI_API_ENDPOINT=https://live-mt-server.wati.io/{tenant-id}
WATI_API_TOKEN=eyJhbGciOi...
WATI_WEBHOOK_SECRET=your_hmac_secret
WATI_BUSINESS_PHONE=919000000000

# ── INT-001: WhatsApp Twilio Fallback ─────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WEBHOOK_SECRET=your_twilio_webhook_secret

# ── INT-002: MSG91 OTP ────────────────────────────────────────
MSG91_AUTH_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxx
MSG91_SENDER_ID=VSOLVH
MSG91_DLT_ENTITY_ID=your_entity_id
MSG91_DLT_TEMPLATE_ID_OTP=your_otp_template_id

# ── INT-002: Fast2SMS OTP Fallback ───────────────────────────
FAST2SMS_API_KEY=your_fast2sms_api_key
FAST2SMS_SENDER_ID=VSOLVH
FAST2SMS_DLT_TEMPLATE_ID=your_dlt_template_id

# ── INT-002: Twilio SMS International ────────────────────────
TWILIO_SMS_FROM=+1xxxxxxxxxx

# ── INT-002: OTP Configuration ───────────────────────────────
OTP_SECRET_SALT=a_very_long_cryptographically_random_salt_string
OTP_VALIDITY_MINUTES=10
OTP_MAX_ATTEMPTS=3
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_PER_HOUR=5
OTP_LOCKOUT_MINUTES=30

# ── INT-003: Firebase FCM ─────────────────────────────────────
FIREBASE_PROJECT_ID=vsolvehub-production
FIREBASE_SERVICE_ACCOUNT_JSON=/app/secrets/firebase-service-account.json

# ── INT-006: Email SendGrid ───────────────────────────────────
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_BACKEND=anymail.backends.sendgrid.EmailBackend
DEFAULT_FROM_EMAIL=noreply@vsolvehub.com
SERVER_EMAIL=alerts@vsolvehub.com
ADMIN_EMAIL_LIST=admin@vsolvehub.com,ops@vsolvehub.com

# ── INT-006: Email Mailgun Fallback ──────────────────────────
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_SENDER_DOMAIN=mg.vsolvehub.com
ANYMAIL_WEBHOOK_SECRET=your_anymail_webhook_secret

# ── INT-007: reCAPTCHA ────────────────────────────────────────
RECAPTCHA_SECRET_KEY=6Lc...your_secret_key
RECAPTCHA_SCORE_THRESHOLD=0.5
RECAPTCHA_TIMEOUT_SECONDS=5

# ── INT-008: DigiLocker ───────────────────────────────────────
DIGILOCKER_CLIENT_ID=your_partner_client_id
DIGILOCKER_CLIENT_SECRET=your_partner_client_secret
DIGILOCKER_REDIRECT_URI=https://api.vsolvehub.com/api/v1/workers/digilocker/callback/
DIGILOCKER_BASE_URL=https://api.digitallocker.gov.in
DIGILOCKER_STATE_TTL_SECONDS=300
```

### Next.js Frontend (`.env.local`)

```env
# =============================================================
# VSOLVEHUB — NEXT.JS FRONTEND ENVIRONMENT VARIABLES
# =============================================================
# Variables prefixed NEXT_PUBLIC_ are exposed to the browser.
# Server-only variables are NOT prefixed and stay server-side.
# =============================================================

NEXT_PUBLIC_API_BASE_URL=https://api.vsolvehub.com

# ── INT-001: WhatsApp Click-to-Chat ──────────────────────────
NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER=919000000000
NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE=Hi, I need help with a service booking.

# ── INT-004: Google Maps ──────────────────────────────────────
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...your_api_key

# ── INT-005: Google Analytics 4 ──────────────────────────────
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# ── INT-007: reCAPTCHA v3 ─────────────────────────────────────
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lc...your_site_key
```

---

## Integration Health Dashboard

Recommended monitoring setup for all third-party integrations. Implement as a Django management command and expose via `/api/admin/health/integrations/` (staff-only).

### Health Check Matrix

| Integration | Check Method | Healthy Signal | Check Interval |
|---|---|---|---|
| WATI (WhatsApp) | GET `/api/v1/getContacts?pageSize=1` with token | HTTP 200 | Every 5 min |
| MSG91 (SMS) | GET wallet balance API; threshold > ₹50 | Balance sufficient | Every 15 min |
| Firebase (FCM) | `firebase_admin.App` initialized without exception | No exception | On app start |
| SendGrid (Email) | GET `/v3/user/account` | HTTP 200 | Every 30 min |
| Google Maps | Geocode "Hyderabad, India" | Lat/lng returned | Every 30 min |
| reCAPTCHA | Verify a known-good test token | `success: true` | Every 30 min |
| DigiLocker | GET DigiLocker base URL health endpoint | HTTP 200 | Every 15 min |

### Alerting Thresholds

| Metric | Warning | Critical | Response Action |
|---|---|---|---|
| WhatsApp delivery rate | < 85% | < 70% | Auto-switch to SMS fallback |
| OTP delivery rate | < 90% | < 80% | Switch to next provider in chain |
| Email bounce rate | > 5% | > 10% | Pause sending; review list hygiene |
| reCAPTCHA block rate | > 20% | > 40% | Investigate bot attack vector |
| FCM delivery rate | < 80% | < 60% | Audit token staleness; trigger cleanup |
| MSG91 wallet balance | < ₹200 | < ₹50 | Auto top-up trigger or admin alert |
| DigiLocker fallback rate | > 30% | > 60% | Investigate DigiLocker availability; alert admin that manual review queue will grow |

### Integration Dependency Matrix

| Platform Feature | WhatsApp | SMS/OTP | FCM | Maps | GA4 | Email | reCAPTCHA | DigiLocker |
|---|---|---|---|---|---|---|---|---|
| Customer Login | — | **Required** | — | — | Tracked | — | Recommended | — |
| Worker Login | — | **Required** | — | — | Tracked | — | Recommended | — |
| Book a Service | — | — | — | **Required** | Tracked | Fallback | **Required** | — |
| Booking Confirmation | **Primary** | — | **Primary** | — | Tracked | **Secondary** | — | — |
| Worker Assigned | **Primary** | — | **Primary** | — | — | — | — | — |
| Worker On The Way | **Primary** | — | **Primary** | — | — | — | — | — |
| New Job Alert (Worker) | Supplemental | — | **Primary** | — | — | — | — | — |
| Worker Onboarding | **Primary** | **Required** | **Secondary** | — | Tracked | **Secondary** | **Required** | **Primary** |
| Worker Aadhaar Verification | — | — | — | — | — | — | — | **Primary** |
| Contact Form | CTA button | — | — | **Required** | Tracked | Alert | **Required** | — |
| Admin Alert | **Primary** | — | — | — | — | **Secondary** | — | — |

---

*Document maintained by: Platform Engineering*  
*Review cycle: Before each major release and after provider pricing changes*  
*Related documents: `system-design.md`, `api-spec.md`, `worker-onboarding.md`*  
*Next review: Pre-launch checklist sign-off*
