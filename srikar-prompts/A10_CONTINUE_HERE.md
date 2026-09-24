# A10 Career/Jobs & M3 State — CONTINUE HERE

**Audience:** any Cursor / Claude / Codex / Grok / Antigravity session that receives only `srikar-prompts/`.
**Updated:** 2026-09-23 10:18 IST — Categories A7, A9, and A10 are 100% COMPLETE & VERIFIED; M3 state snapshot saved.
**Master State Snapshot:** See [`M3_STATE_2026-09-23.md`](M3_STATE_2026-09-23.md)
**Do not commit this folder.** Never `git add -A`.

---

## 60-second status

| Item | State |
|---|---|
| Branch | `feature/m3-a10-listings` |
| Base | `main` @ `4a08ad3` |
| Draft PR | **https://github.com/VsolveHub/vsolvehub/pull/1** (Draft — do not merge) |
| Careers (A10) | **100% Completed** (4/4 remediation slices: PhoneField, Decomposed <250L, M1 Design Tokens, Server Schemas) |
| Rentals (A7) | **100% Completed** (M1 token uplift, Rentomojo/Zoomcar flow, modular features, contract-typed client, equipment filters) |
| Stays (A9) | **100% Completed** (Airbnb/Zolo flow, hotels filters, server date quote pricing, enquiry lifecycle, M1 tokens) |
| Backend Tests | **34 / 34 passed (100%)** (`tests/listings/`, `tests/rental/`, `tests/stay/`) |
| Frontend Tests | **71 / 71 passed (100%)** (Vitest navigation, shell, rental actions, header, boundary tests) |
| TypeScript | **0 Errors (100%)** across Customer, Partner, Admin |
| Boundary Rules | **Strict 0 raw fetch**: all calls through `@vsolve/api-client` via `request(() => getApiClient()...)` |
| Payments (Razorpay) | Adapter ready in `commerce/providers.py`. Keys empty in `backend/.env`, pending client test keys |
| Running Services | Django `:8000`, Customer `:3000`, Partner `:3001`, Admin `:3002` |
| Merge to main | **Do not merge until Saturday 26 Sep** (per Week 1 exit checklist) |

---

## Remaining Week 1 Ship Gates

1. **Lane E**: Build Wallet, V Coins & Referral stack (starts Wed 23 Sep).
2. **Lane C**: Populate test Razorpay keys into `backend/.env` and execute test charge/refund matrix.
3. **Lane G**: Build Admin Reports & Excel/CSV/PDF exports (starts Thu 24 Sep).
4. **Saturday 26 Sep**: Merge integration trunk $\rightarrow$ `main` once checklist is green.
5. **Sunday 27 Sep**: Final full-website client demo and Milestone 3 sign-off.

---

## Product law (unchanged)

Listing ≠ Booking. Applicant never pays. Fail closed without ACTIVE `A10VariantConfiguration` + approved `A10_LISTING`. No merge of `m3-changes` / cherry-pick `3fa3016`.
