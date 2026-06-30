### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Key decisions affecting Phase 1:

- **D-01 (DATA):** No separate leads table — admin flags (`viewed_at`, `is_spam`, `closed_at`) are columns on `bookings`. Schema must include these from Day 1.
- **D-08 (DATA):** Payment amounts recorded from Day 1 even without a gateway. `amount` column on `bookings` required in Phase 1.
- **D-27 (DATA):** All seven archetype schemas in the DB from Phase 1; only A & B wired in code.
- **D-20 (DISP):** Admin is a monitor, not a dispatcher. Auto-dispatch engine is the normal path; admin force-assign is an exception only.
- **D-timer (DISP):** 30s offer timer lives on the server (Celery). Client countdown is cosmetic.

### Pending Todos

- Start DLT entity + sender ID + OTP template registration with MSG91 (parallel to Phase 1 — 2–6 week lead time; launch blocker)
- Submit all WhatsApp notification templates to Meta via WATI (parallel to Phase 1 — 1–7 days per template; launch blocker)
- Register DigiLocker API partner account for sandbox access (needed before Phase 6 KYC)

### Blockers/Concerns

- **DLT registration (India):** TRAI DLT approval for SMS OTP takes 2–6 weeks. Must start Week 1 or it blocks Phase 7 (Notifications) at launch.
- **WATI template approval:** Meta pre-approves all WhatsApp templates; 1–7 days per template, rejection possible. Submit all 6+ templates before writing notification code.
- **DigiLocker sandbox:** Partner registration required before Phase 6 KYC code can be tested end-to-end.
- **FCM on low-end Android:** HIGH-priority wakelock not guaranteed on MIUI/ColorOS (Tier 2/3 common devices). Needs physical device testing (2GB RAM, Android 10+), not emulator.
