# Customer Booking Flow and UX

## Experience goal

The booking journey should feel like one responsive application:

- Immediate feedback for every tap
- No automatic slot selection
- No repeated confirmation after login
- No hidden fee changes
- No payment-stage capacity surprise
- No “order placed” message without a real booking state
- Clear recovery when network/provider/payment checks fail

## Public discovery

```text
/services
/services/technician
/services/technician/[service-slug]
```

Service cards show:

- Service name
- Short outcome-based description
- “Starts at ₹X”
- Typical/recommended duration
- Rating or trust indicator when real data exists
- One clear action

The “starts at” amount must come from the same active `ServiceRate` used by quoting.

## Booking workspace

Recommended route:

```text
/book/[service-slug]
```

Desktop:

- Main interactive column
- Sticky quote/summary rail
- Stable progress indicator

Mobile:

- One primary task at a time
- Sticky bottom price + continue action
- Summary opens as a sheet
- No content hidden behind fixed controls

## Stage sequence

### 1. Service and location

Show:

- Selected service/variant
- Current service address
- Change-address control
- Serviceability result

Rules:

- Ask location before requirements.
- Reverse geocoding suggests an address; customer confirms it.
- If not serviceable, stop with helpful alternatives.
- Changing address invalidates slot, provider and quote holds.

### 2. Booking type

Options:

- **Instant**
- **Scheduled**

No option is preselected.

Instant (revised per ADR-028/029 —
[doc 11 §2](./11-payment-first-instant-and-cancellation-policy.md)):

- Explain expected arrival window.
- Query eligible live capacity as a pre-payment existence check; a known-empty pool blocks checkout
  before any charge.
- Take payment, then show “Finding your professional” while a ranked Partner is assigned and awaiting
  acknowledgement.
- Confirm only after acknowledgement makes the provider-specific capacity hold firm.
- If nobody acknowledges after the bounded rounds, offer reschedule slots first, then a bounded retry,
  then a full refund with a real timeline. Never claim the customer was not charged.

Scheduled:

- Show the next seven days.
- Show available windows only after a date is selected.
- No date or time is preselected.
- Availability considers full duration plus existing extensions/reservations.

### 3. Scope and requirements

Questions are driven by catalog configuration.

Rules:

- Ask only questions relevant to the selected variant.
- Reveal dependent questions progressively.
- Display price impact beside paid options.
- Support quantity as scope, not duplicate bookings.
- Preserve notes and photos when quantity changes.
- Photos and notes are optional unless service configuration requires them.
- Validate near the field and provide a recovery action.

### 4. Duration

Show:

- “Recommended for your selected work”
- Default value, initially one hour where configured
- 30-minute supported increments
- Updated estimate
- Explanation that extension requires approval

Duration is a customer choice within configured bounds, but scope may change the recommendation.

### 5. Provider

Options:

- **Auto Assign — recommended**
- Up to four eligible providers
- Previously booked/preferred provider when eligible

Provider cards show only decision-useful information:

- Name/photo
- Rating and completed-job count
- Relevant skill badge
- Estimated arrival or slot availability
- Price difference, if provider-specific pricing exists
- “Booked before” indicator

Provider selection never bypasses skill, service area, KYC, schedule or overlap rules.

For Scheduled work, the backend creates a short-lived capacity hold for the selected/auto-assigned
candidate before payment.

For Instant work this is reversed per ADR-028/029
([doc 11 §2, §3](./11-payment-first-instant-and-cancellation-policy.md)): payment is captured first, then
a Partner is **assigned and must acknowledge**; acknowledgement makes the Partner-specific hold firm.
There is no Accept/Decline offer and **no provider-selection step** — the preceding provider-card guidance
in this section applies to Scheduled only. A known-empty eligible pool blocks Instant checkout before any
charge, so the system never charges into a search it already knows is hopeless.

### 6. Review and login

Review shows:

- Address
- Instant/scheduled slot
- Scope and quantities
- Duration
- Provider preference
- Cancellation/reschedule policy
- Complete quote

For a logged-out customer:

1. Store a `PendingCartAction` locally; do not create a fake booking.
2. Open login as an interruptible step.
3. Verify OTP.
4. Automatically create/update the authenticated `Cart` and `CartItem`.
5. Return to the same review state with the server cart hydrated.
6. Continue the original add/confirm action; the customer does not click “Confirm and continue” again.

`Booking` is never created at this stage. For Milestone 1, the server cart is created only after authentication, matching the “Login to add items” product rule.

### 7. Payment page

Use a dedicated route or stable workspace stage:

```text
/checkout/[checkout-session-id]
```

Show:

- Vsolve Hub identity and trust information
- Booking details
- Capacity-hold countdown if applicable
- Itemized service price
- Platform fee
- GST with correct applicability
- Total payable
- Payment method
- Cancellation/refund policy
- One primary “Pay ₹X” or “Confirm booking” action

Before initiating payment, the server revalidates:

- Quote version/expiry
- Capacity hold ownership/expiry
- Address/serviceability
- Customer identity
- Payment amount

### 8. Confirmation

Confirmation is displayed only from an authoritative backend result.

Valid outcomes:

- Confirmed booking with provider/slot
- Payment pending verification
- Capacity hold expired—choose another slot/provider
- Payment failed—not booked

Do not show:

- “Order placed” followed by “No provider available — refunded”
- Success when only a client redirect occurred
- A generic “Something went wrong” without recovery

### 9. Booking status

Fixed services use a status timeline:

```text
Confirmed
  → Professional assigned
  → Arriving
  → Ready to start
  → In progress
  → Completed
```

No live map is shown for fixed home services.

`Partner arrived` is produced only when the assigned Partner taps **Arrived**. Django records the
server timestamp and publishes a notification event. The Customer receives “Your professional has
arrived” through in-app and configured push/SMS channels. Arrival does not start the timer.

The page contains:

- Booking reference and service summary
- Provider information when assigned
- Contact/support controls
- Slot and address
- Start OTP
- Duration/timer state
- Quote/invoice
- Cancellation/reschedule actions where allowed
- Extension controls during work

Use server-sent events or bounded status polling for presentation. Polling must not perform dispatch work.

## Work timer

Before OTP:

- Display booked duration.
- Display start OTP securely.
- Explain that countdown begins after OTP confirmation.

After provider confirms OTP:

- Backend records `started_at`.
- UI displays `60:00`, `59:59`, etc.
- Use tabular numerals to prevent layout shift.
- Reconcile from backend timestamps after refresh/backgrounding.
- Use `server_now` returned by Django to correct client clock skew.

At zero:

- Display “Work exceeds booked time by 00:01”.
- Do not silently bill the customer.
- Offer extension choices where policy permits.
- Partner can request; customer approves.
- Approved extension updates end time and price revision.

## Single-service vs multi-service

### One service

Display the booking slot card directly. Do not show:

- A scheduling summary that pretends a slot is selected
- “Edit slots” before selection
- “Select slots for all services”

### Multiple services

Each independently fulfilled service gets:

- Its own booking
- Its own slot/type
- Its own provider/capacity hold
- Its own status lifecycle

The review page may group them in one order.

Before payment, all bookings must have valid capacity holds. If any hold fails, payment is not initiated and the failed service is highlighted.

## Cart policy

For Milestone 1:

- Django contains real `Cart`, `CartItem` and `CartItemScope` tables.
- A single service goes directly from its cart-backed booking workspace to checkout; the customer does not need an unnecessary cart-page stop.
- The cart page is shown when the customer intentionally adds multiple independently fulfilled services or chooses to review saved items.
- Same-service quantity in one visit remains one cart item and later one booking.
- A separate-visit choice creates a separate cart item and later a separate booking.
- Cross-sell cannot bypass required scope and availability.

## UI system

Preserve the existing Vsolve Hub brand direction but normalize it into semantic tokens.

The existing master palette is amber-led with blue accent. User feedback has shown that large blue loading surfaces feel awkward. Therefore:

- Use warm neutral/amber surfaces for primary marketplace context.
- Reserve blue for links, informational actions or selected states where contrast is strong.
- Use orange/amber carefully for primary conversion actions.
- Use semantic success/warning/error tokens.
- Never communicate state by color alone.
- Avoid large saturated color blocks behind low-contrast text.

Interaction requirements:

- Minimum 44×44px touch targets
- Visible focus rings
- 4.5:1 text contrast
- One primary action per stage
- 150–300ms purposeful transitions
- Reduced-motion support
- SVG/icon-font icons, not emoji
- Visible labels, not placeholder-only inputs
- Predictable back navigation
- State and scroll preservation
- Responsive validation at 375, 768, 1024 and 1440px

## Error and empty-state language

Every error must state:

1. What happened
2. Whether money/booking state changed
3. What the customer can do next

Example:

```text
That 10:00 am slot was just taken.
You have not been charged.
Choose another available time.
```

Avoid generic messages such as “Something went wrong” unless a trace/reference code and retry/support path are also provided.
