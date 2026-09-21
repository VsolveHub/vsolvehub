# A10 Career/Jobs — CONTINUE HERE

**Audience:** any Cursor / Claude / Codex / Grok session that receives only `srikar-prompts/`.
**Updated:** 2026-09-13 21:05 IST — Grok **PASS on code**; process still HOLD
**Do not commit this folder.** Never `git add -A`.

---

## 60-second status

| Item | State |
|---|---|
| Branch | `feature/m3-a10-listings` @ **`44ac07a`** (pushed) |
| Base | `main` @ `4a08ad3` |
| Draft PR | **https://github.com/VsolveHub/vsolvehub/pull/1** (Draft — do not merge) |
| Grok | **PASS on code** · process HOLD (P2/P3 cleared at `44ac07a`) |
| CI (Checks UI) | **No checks for this commit** on tip `44ac07a` — confirm Actions/workflows separately |
| Pytest | Prior owner: **22 passed** @ `4b71df0`; fail-closed case built — owner re-verify pending |
| Domain smoke | **SMOKE_OK** (local) |
| Wave D3 / ADR-0012 | Keep `[~]` / Proposed |
| Merge to main | **Do not** |

---

## Remaining ship gate (process HOLD)

1. Staging owner-run **M3-A10-01…16**
2. Owner UI pass **M3-FE-332**
3. Confirm CI (or enable workflows) — Checks tab currently empty for `44ac07a`
4. You accept Wave D3 → then mark `[x]` / ADR Accepted and consider merge

Client demo: [`CLIENT_DEMO.md`](CLIENT_DEMO.md). Last Grok ask/record: [`GROK_REVIEW_ASK.md`](GROK_REVIEW_ASK.md).

---

## Product law (unchanged)

Listing ≠ Booking. Applicant never pays. Fail closed without ACTIVE `A10VariantConfiguration` + approved `A10_LISTING`. No merge of `m3-changes` / cherry-pick `3fa3016`.
