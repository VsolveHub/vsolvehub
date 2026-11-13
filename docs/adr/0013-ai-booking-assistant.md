# 13. AI booking assistant over the existing booking commands

- Status: Accepted
- Date: 2026-11-06

## Context

Milestone 4 includes an AI chatbot. The client asked for one that books: the customer describes the
need in their own words, and the chat finds the service, the address and a time, takes them to
payment, and reports the confirmation. The brief proposed new tables for services, availability,
bookings and payments, a `pending_payment → confirmed` status pair, and a Razorpay payment link per
booking.

All of that already exists. The catalogue, the cart, the scheduling grid, fulfilment planning,
checkout, Partner dispatch, Razorpay orders, signed webhooks, reconciliation, capture and the
"captured without capacity" refund are the live booking engine, and the website drives them. A
second copy for the chat would be two booking engines that agree until the day they do not.

## Decision

1. **A module, not a service.** `apps.assistant` lives in the Django monolith (`AGENTS.md`: no
   microservices without an approved ADR). Its tools need the domain commands,
   transactions and the customer's session; a separate service would reach them over HTTP and
   duplicate authorisation.
2. **Tools wrap existing commands; nothing is reimplemented.** `add_cart_item`,
   `create_booking_windows`, `create_fulfilment_plan_set`, `create_plan_quote` and
   `create_checkout` are called as the signed-in Customer, so every invariant the website relies on
   holds for the chat by construction.
3. **The assistant tables are conversation tables only.** `AssistantSession`, `AssistantMessage`
   and `AssistantBooking` (a link to the `CheckoutSession` and `BookingGroup`, plus the last phase
   announced). Statuses are read live, never copied.
4. **The brief's statuses map onto the existing ones.** "Pending payment" is the `BookingGroup`
   moving `MATCHING → PAYMENT_PENDING`; "confirmed" is `BOOKED`, which only
   `commerce.services.capture` sets, after a signed Razorpay webhook or a server-to-server payment
   read. The chat announces the change; it never decides it.
5. **Payment stays on the booking page.** The chat's Pay card links to `/bookings/{id}`, which
   already runs the profile gate, wallet and coins, the Razorpay handoff and reconciliation. A
   Razorpay Payment Link is deferred to the WhatsApp channel, where there is no page to link to,
   because payment links create their own orders and would need a second capture mapping in the
   money path.
6. **The model never sees database ids.** Tools return opaque references (`V3`, `T12`) mapped in
   the session's state. A reference the model was not given resolves to nothing.
7. **Confirmation needs a second message.** `confirm_booking` refuses a quote created in the same
   turn: the Customer must have seen the price and answered it. One open booking per conversation
   is a database constraint.
8. **Providers are fail-closed (ADR 0004).** `ASSISTANT_PRIMARY_PROVIDER` (Gemini) needs its key and
   model or the API answers `503`. The OpenAI fallback is opt-in through
   `ASSISTANT_FALLBACK_PROVIDER` and every use of it is logged. Both are thin `requests` adapters
   with bounded timeouts, like the Razorpay adapter; no vendor SDK is added.
9. **Spend is bounded.** Per-user/IP throttles, a per-conversation message cap, a rolling 24-hour
   cap across all conversations, a per-turn deadline and a tool-round limit.

## Consequences

- The chat can book only what the website can book, through the same rules; A1 visits today.
  Requests (A3/A5), rentals, stays and listings get a link to their own flow.
- The Customer is told "confirmed" from exactly one source of truth.
- Customer text is sent to the model vendor. Tool results send no phone numbers or house
  numbers, only address labels and localities. Retention of `AssistantMessage` needs an owner
  decision (proposed: 90 days).
- The customer `customer_booking_confirmed` notice added alongside this work applies to every
  booking, not only chat bookings.
