# V Solve Hub — PRD Decision Log

> Why the PRD reads the way it does. Read [PRD.md](PRD.md) for *what* to build; read this for the *why* behind the non-obvious calls. Newest first.

---

## 2026-07-06 — Consult-First model for Crew & Quotes (major)

**Decision:** Crew and Quotes are **not two separate engines** — they are two *outcomes* of one **Consult-First engine**. The customer pays a **small consultation/survey fee** (not a full payment), a pro assesses the job, and returns a **structured estimate** that is either **workers-for-days (Crew, M2)** or **a lump sum (Quote, M3)**. The fee is credited to the bill on booking.

**Why:**
- **It's how India actually works.** No one pays ₹85,000 to a contractor they haven't met, but they'll pay ₹500 for him to come survey. The consult fee is a low-commitment entry ticket that filters time-wasters, pays the pro for his visit, and converts into the booking.
- **The client's own price sheet proves it.** Technicians carry a *Basic Visit Charge*; decoration/DJ carry *Site Visit & Consultation*; event management carries *Event Consultation*; architects/designers/engineers carry **no price** — because they can't be quoted without a conversation.
- **It's simpler than full-escrow-upfront** and converts far better in this market.

**How to apply:** any service without a catalog price routes through Consult-First. The only difference between M2 and M3 is the estimate shape (§6.2 vs §6.3) and dispatch (broadcast for labour vs inbox-pull for projects).

**Locked defaults:**
1. Consult fee → **credited** on booking, **forfeited to the provider** if the customer walks away, **refunded** if the provider no-shows.
2. For labour, the fee buys the assessment and **up to 3 contractors** may return competing estimates so the customer can compare.
3. **Materials** are a first-class part of every estimate, with a per-line **who-supplies** toggle (Customer / Contractor / Platform-procured).

**Supersedes:** an earlier full-estimate-into-escrow crew model. That approach (pay everything upfront, settle by attendance) is dropped in favour of consult-fee-first.

---

## 2026-07-06 — Aligned PRD to project_milestones.md

**Decision:** rewrote the PRD as a **freelancer build spec** around **11 categories, 8 booking models, 3 phases**, matching [project_milestones.md](../project_milestones.md).

**Why:** the milestone doc is the contract (scope, payment, acceptance). The PRD must map cleanly onto it so the engineer knows exactly what ships in each phase. Where the two disagree on scope, **the milestone doc wins.**

**Key mappings established:**
- Milestone's named deliverables (*Smart Inspection Booking, Digital Estimation Engine, Vendor Quote System, Additional Work Approval, Customer Feedback, Vendor Dashboard, Warranty System*) = the components of the **Consult-First engine** (PRD §6).
- **Phase 1** = M1/M2/M3/M7 across 7 groups (Technician, Beautician, Home, Pet, Construction Labour, Man Power, Event & Media) — web only, no payments/OTP/apps.
- **Phase 2** = M4/M5/M6 (Rental, Accommodation, Jobs) + Razorpay + MSG91 OTP + Wallet + V Coins + Referral + Admin.
- **Phase 3** = Customer App + Partner App + **Rapido (M8 Vehicle)** + AI Chatbot + single combined go-live of all 11.

---

## Source of truth

- **Catalog:** [services.md](services.md) — every service tagged with its booking model, from *V Solve Hub — Categories & Sub Categories.csv*.
- **Scope & payment:** [project_milestones.md](../project_milestones.md).
- **Product spec:** [PRD.md](PRD.md).
