
## Found during the mobile bug-fix pass (26 Nov 2026)

- Customer `features/bookings/view/mock-professional-card.tsx`: shows an invented "★ 4.9 · 5+ yrs · 500+ jobs" for every held booking. Mobile now shows only "Professional reserved" and that details unlock after payment.
- Customer job cards: pay unit hard-coded to "/mo" and a made-up "₹10,000 – ₹15,000/mo" when no pay is published. Mobile now formats from `salary_period` (`src/features/listings/pay.ts`).
- Customer account documents screen (if present on web): hard-coded "verified" documents and a fake upload. Mobile replaced it with an honest empty state.
