/**
 * DO NOT EDIT. Generated from the published Django OpenAPI contract.
 *
 * Source:   contracts/openapi/v1.yaml (version 1.28.0)
 * Checksum: 38c6565538b4198c
 *
 * Regenerate with: pnpm --filter @vsolve/api-client generate
 */
export interface paths {
    "/api/v1/addresses/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["addresses_list"];
        put?: never;
        post: operations["addresses_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/addresses/{address_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["addresses_retrieve"];
        put?: never;
        post?: never;
        delete: operations["addresses_destroy"];
        options?: never;
        head?: never;
        patch: operations["addresses_partial_update"];
        trace?: never;
    };
    "/api/v1/auth/csrf/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_csrf_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/finance/step-up/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_finance_step_up_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_logout_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/otp/request/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_otp_request_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/otp/verify/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_otp_verify_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/privacy/consents/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_privacy_consents_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/privacy/preferences/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_privacy_preferences_list"];
        put: operations["auth_privacy_preferences_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/privacy/requests/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_privacy_requests_list"];
        put?: never;
        post: operations["auth_privacy_requests_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/roles/switch/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["auth_roles_switch_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/session/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_session_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/sessions/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["auth_sessions_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/sessions/{session_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["auth_sessions_destroy"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking-groups/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["booking_group_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking-groups/{group_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["booking_group_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking-groups/{group_id}/address/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booked_group_change_address"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking-groups/{group_id}/cancel/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booking_group_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking-groups/{group_id}/cancel-booked/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Post-payment group cancellation.
         *
         *     Distinct from `POST /booking-groups/{id}/cancel/`, which is and remains the *pre-payment*
         *     command and still refuses a `BOOKED` group. Two different money paths — one collects
         *     nothing, one runs the fee ladder per unit — so they are two different operations rather
         *     than one endpoint that changes meaning depending on state.
         */
        post: operations["booked_group_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking-groups/{group_id}/reschedule/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booked_group_reschedule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/booking/windows/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booking_windows_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["booking_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/cancel/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booking_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/completion/confirm/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booking_completion_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/completion/dispute/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booking_completion_dispute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/quality-dispute/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description 72-hour quality dispute after auto-finalisation (spec §12).
         *
         *     Distinct from `CustomerCompletionDisputeView`, which covers the 0-24h window while a
         *     completion response is still pending. This path only opens once the visit was
         *     auto-finalised, and it holds the Partner payout without touching `cancel_booking`.
         */
        post: operations["booking_quality_dispute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/reschedule/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["booking_reschedule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/reschedule-windows/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The slot grid for moving a visit — the same grid the Customer chose from at checkout.
         *
         *     `GET`, and cart-free: everything it needs is on the Booking. The checkout equivalent is a
         *     `POST` because its answer is derived from the caller's session cart, which is not
         *     addressable in a URL; this one is genuinely a read of one identified visit.
         */
        get: operations["booking_reschedule_windows"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/bookings/{booking_id}/start-otp/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description The Customer requests the code; the Partner types it in.
         *
         *     Two different people, two different endpoints, which is what makes the OTP mean anything:
         *     it proves the Partner is standing in front of the Customer. Publishing the code to the
         *     Partner, or letting the Partner request it, would prove nothing at all.
         */
        post: operations["booking_start_otp_request"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["cart_retrieve"];
        put: operations["cart_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/items/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["cart_items_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/items/{item_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * @description Retained for callers already sending a DELETE body.
         *
         *     The request shape is still dropped from the published document by the
         *     schema generator, so generated clients must use the POST sibling.  This
         *     method exists only so existing hand-written callers keep working, and it
         *     runs the same `remove_cart_item` command with no removal logic of its own.
         */
        delete: operations["cart_items_destroy"];
        options?: never;
        head?: never;
        patch: operations["cart_items_partial_update"];
        trace?: never;
    };
    "/api/v1/cart/items/{item_id}/remove/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description `POST /cart/items/{item_id}/remove/` — the publishable removal command.
         *
         *     drf-spectacular does not emit a `requestBody` for DELETE, so the optimistic
         *     version pair Django requires was unreachable from a generated client.  This
         *     sibling publishes the same body, calls the same domain service and returns the
         *     same complete Cart.  No `Idempotency-Key` is required: the version pair is the
         *     replay protection, because a repeat of an accepted removal can no longer match
         *     a live row.
         */
        post: operations["cart_items_remove"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/merge/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["cart_merge_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/scheduling-groups/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description How the current cart splits into separately-schedulable visits.
         *
         *     A read, not a command: nothing is reserved, priced or persisted. It exists
         *     because the Customer has to be shown *how many* start times to pick before
         *     picking any, and the plan-set command cannot answer that — it takes the times
         *     as input.
         *
         *     Serviceability is resolved here for the same reason the planner resolves it: a
         *     cart that straddles two service areas, or contains something this address
         *     cannot be served, has no visits rather than empty ones. The refusal carries the
         *     same per-item reasons the planner raises, so one screen renders both.
         */
        post: operations["cart_scheduling_groups_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/cart/suggestions/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Services one Partner could add to a visit this cart already has.
         *
         *     `POST` rather than `GET` because the answer is derived from the caller's own
         *     cart, which is resolved from the session rather than the URL. A `GET` would
         *     imply a cacheable address for something that differs per caller.
         *
         *     Open to anonymous callers for the same reason the cart itself is: a suggestion
         *     is a catalog read, and asking someone to log in before we will tell them what
         *     else a professional could do is a worse product for no privacy gain.
         */
        post: operations["cart_suggestions_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categories/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["categories_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/categories/{category_slug}/services/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["categories_services_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkouts/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["checkouts_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkouts/{checkout_id}/payment/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["checkouts_payment_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkouts/{checkout_id}/search/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["checkouts_search_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checkouts/{checkout_id}/search/advance/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["checkouts_search_advance_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-amendments/{engagement_amendment_id}/accept/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description **Money first, scope second (`M2-BE-506`).** Accepting does not change the agreed work until the money has moved. Three routes, chosen by the commercial mode and the sign of the delta and never by anything a client sends:
         *
         *     - `LEAD_ONLY` (A3): no platform money exists to move, so the amendment authorizes here and the extra shift-days appear immediately. `checkout` is `null`.
         *     - Managed (A5), negative delta: the refund is issued against the stage's own funding payment **before** the scope shrinks, so there is no instant in which the Customer owns less work than they have paid for. `checkout` is `null`.
         *     - Managed (A5), positive delta: `checkout` carries a `PaymentAttempt` and **nothing changes until a verified provider callback**. A client redirect claiming success is a claim by the party that benefits from it.
         *
         *     Repeating an acceptance while its payment is pending returns the same attempt rather than starting a second charge.
         */
        post: operations["m2_engagement_amendment_decide"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-amendments/{engagement_amendment_id}/decline/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description The Customer says no. The agreed work is unchanged, nothing has moved, and the vendor may propose a different change. */
        post: operations["m2_engagement_amendment_decline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description One shift-day (A3) or milestone (A5) with its evidence, money and clocks. Both `review_due_at` and `payout_release_due_at` are nullable and their nulls are real policy states: no review window is configured, so this stage never auto-approves; no payout hold is configured, so its payout does not release on a clock. Render nothing there rather than a countdown to a deadline nobody set. */
        get: operations["m2_stage_read"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/approve/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description The Customer accepts the work on one stage. `AWAITING_REVIEW` → `APPROVED`. On a managed (A5) engagement this writes the vendor's earning **held** on the M1 payout rails and stamps `payout_release_due_at` — the dispute window — and the money becomes payable when that window closes. On `LEAD_ONLY` (A3) nothing is held because nothing was collected, so the stage goes straight to `RELEASED`. */
        post: operations["m2_stage_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/correction/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Send a stage back to be done properly. `AWAITING_REVIEW` → `CORRECTION_REQUESTED`, and the review clock stops. **A correction is not an amendment**: it asks for the agreed work, it does not change what the agreed work is, and it moves no money. A Customer who wants something different is asking for a change order, which needs the vendor's agreement. */
        post: operations["m2_stage_request_correction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/dispute/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Formally object to submitted work. `AWAITING_REVIEW` → `DISPUTED`, and the engagement shows `DISPUTED` alongside. **A dispute stops only the disputed allocation**: every other stage carries on and any payout already released stays released. The review timeout cannot reach a disputed stage, so silence never becomes approval on something somebody has objected to. */
        post: operations["m2_stage_dispute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/dispute/decision/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description `DISPUTED` → `APPROVED` or `CORRECTION_REQUESTED`, as an auditable domain command rather than a database edit. Two outcomes and not three: a partial outcome is a scope amendment both sides accept, never an operator quietly repricing a stage. The full case machinery — evidence, deadlines, appeals — is Wave C6; this is the transition it will drive, published now so a disputed stage is not a dead end. */
        post: operations["m2_stage_dispute_resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/evidence/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Verify the object that arrived against the intent and record it as evidence. `processing_status` lands `PENDING`: the bytes are the ones the client promised, and whether they are safe is a separate question a scanner answers. Two concurrent finalizes of one intent produce one evidence row. */
        post: operations["m2_stage_evidence_finalize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/evidence/uploads/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description A signed, short-lived upload URL for one evidence file, plus the intent id to finalize against. The server names the object key and records the size, media type and SHA-256 it expects; finalization fetches the object back and compares. Without the intent row, 'verify the upload' would mean 'believe the client'. `NOTE` is not a kind here — a note carries no file and is submitted with the stage. */
        post: operations["m2_stage_evidence_upload_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/funding/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Fund one A5 stage, **at face value and in order**. There is no stage credit: the visit-plan money was spent on the visits themselves and settles per share, so discounting a stage by it would pay for those visits twice out of the vendor's work. Projects collect one stage at a time and never the full project value because a proposal was accepted. */
        post: operations["m2_stage_funding_checkout_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/start/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Begin work on a stage. `PENDING` → `IN_PROGRESS`, and `CORRECTION_REQUESTED` → `IN_PROGRESS` after the Customer sent it back. **A5 requires verified funding at face value** — the visit-plan money settles per share and never discounts a stage — so a funded A5 stage is already `IN_PROGRESS` and this call is an idempotent no-op; reaching it on an unfunded one is `m2_stage_not_funded`. */
        post: operations["m2_stage_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagement-stages/{stage_id}/submit/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Hand the stage to the Customer for review. `IN_PROGRESS` → `AWAITING_REVIEW`, and the moment the review clock starts. The note is required and is stored as its own append-only evidence row rather than as a field on the stage, so a correction cycle leaves both accounts readable — what the vendor said the first time and what they said after the Customer pushed back. Resubmitting after a correction restarts the review window from zero, because the Customer is looking at different evidence. */
        post: operations["m2_stage_evidence_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagements/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The caller's engagements, newest first, as a cursor page. A Customer sees the ones they commissioned and a Partner the ones they are performing; the `role` query parameter picks which, and defaults to whichever the caller can be. Read `commercial_mode` before promising anything: `LEAD_ONLY` (A3) is a connection, not a protected booking. */
        get: operations["m2_engagement_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagements/{engagement_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The agreement frozen at reconfirmation, with its ordered stages. **Read `commercial_mode` before promising anything**: `LEAD_ONLY` (A3) means the Customer pays the vendor directly and Vsolve's protection is matching and replacement, not a protected booking. `MANAGED_PAYMENT_REQUIRED` (A5) funds one stage at a time, at face value — the visit-plan money settles per share and never discounts a stage. */
        get: operations["m2_engagement_read"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagements/{engagement_id}/amendments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Every change request on this engagement, newest first. Both parties read it. */
        get: operations["m2_engagement_amendment_list"];
        put?: never;
        /**
         * @description The vendor asks to change the agreed work. **Routed through the M1 scope-amendment engine** — same status machine, same lines, same expiry rule — with two line kinds M2 adds because an engagement has no catalog task to price from.
         *
         *     **The archetype fixes the shape and the pricing authority.** An A3 engagement takes a `TIME_EXTENSION`, priced by the **server** from the worker-day rate frozen at reconfirmation: the vendor names days, never money, because a vendor who could name the money could re-price a job the Customer already committed to. An A5 engagement takes a `CHANGE_ORDER`, priced by the vendor line by line, because a bespoke outcome has no catalog rate — and the server still sums the lines and rejects any client-supplied total. `amount_paise` is signed: negative removes scope.
         *
         *     One live change request per engagement.
         */
        post: operations["m2_engagement_amendment_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagements/{engagement_id}/completion/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description The Customer accepts the finished work. `COMPLETING` → `COMPLETED`, and the requirement closes as `CLOSED_COMPLETE`. An engagement reaches `COMPLETING` on its own, when every stage is released; this is the separate fact that the Customer agrees it is done. The warranty period a configured A5 variant then enters is Wave C5 and is not built. */
        post: operations["m2_engagement_completion_accept"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/engagements/{engagement_id}/events/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Every move on this engagement and its stages, oldest first. `actor_is_system` separates a decision somebody made from one a clock made — 'approved by you' and 'approved because the review window closed' are different sentences and a timeline that renders them identically is lying about who decided. Actor identity itself is never published: which of the two parties acted is derivable from `reason_code`, and the counterparty's user id is not their business. */
        get: operations["m2_engagement_event_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finance/refunds/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Issue a refund against an Order's Fulfilment Units.
         *
         *     Gated on `HasRecentOperationsStepUp` rather than the finance variant. The platform
         *     has one staff role — Operations — and a separate `finance` role was never granted to
         *     anybody, so the finance gate made these endpoints unreachable rather than restricted.
         *
         *     The control that actually matters is unchanged: a money-moving command still requires
         *     a fresh OTP confirmation on the session, and `mark_session_step_up` is role-agnostic,
         *     so `POST /auth/finance/step-up/` still stamps the session this reads.
         */
        post: operations["finance_refunds_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/finance/refunds/{refund_id}/reconcile/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Ask the provider what became of a refund. See the note on the collection view. */
        post: operations["finance_refunds_reconcile_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/fulfilment-plan-sets/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["fulfilment_plan_sets_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/fulfilment-plan-sets/{plan_set_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["fulfilment_plan_sets_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/geocoding/reverse/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["geocoding_reverse_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/live/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["health_live_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/ready/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["health_ready_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/assisted-checkouts/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_assisted_checkouts_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/bookings/{booking_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_booking_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/bookings/{booking_id}/assisted-start/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description The audited channel-outage workaround, and the one place step-up is mandatory.
         *
         *     `operations_assisted_start` refuses a blank outage reason on its own, but the
         *     re-verification it describes has never been enforced anywhere, because until this release
         *     there was no view to enforce it in. `HasRecentOperationsStepUp` — already written, already
         *     documented as gating exactly this — is that enforcement. It is not a general-purpose OTP
         *     bypass: it starts work without the Customer's code and says so, loudly, in the audit trail.
         */
        post: operations["operations_booking_assisted_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/bookings/{booking_id}/recover/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_booking_recover_partner"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The queue, filtered the way somebody actually works it.
         *
         *     Cursor-paginated rather than offset: a queue is inserted into constantly, and an offset page
         *     two skips whatever arrived while page one was being read. Same `StrictCursorPagination` the
         *     Partner application queue and offer inbox use.
         */
        get: operations["operations_cases_list"];
        put?: never;
        /**
         * @description The queue, filtered the way somebody actually works it.
         *
         *     Cursor-paginated rather than offset: a queue is inserted into constantly, and an offset page
         *     two skips whatever arrived while page one was being read. Same `StrictCursorPagination` the
         *     Partner application queue and offer inbox use.
         */
        post: operations["operations_cases_open"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/{case_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_case_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/{case_id}/claim/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Shared plumbing: version guard, idempotency key, projection. */
        post: operations["operations_case_claim"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/{case_id}/escalate/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Shared plumbing: version guard, idempotency key, projection. */
        post: operations["operations_case_escalate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/{case_id}/notes/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description A note or a record of something sent. Never moves the case — sending is not progress. */
        post: operations["operations_case_add_note"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/{case_id}/resolve/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Closing a case names what happened.
         *
         *     The resolution must be one of the case kind's required terminal results — published on the
         *     detail projection as `allowed_resolutions`, so a console never has to carry its own copy of
         *     a rule that differs per kind.
         */
        post: operations["operations_case_resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/cases/summary/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The home screen's numbers, counted server-side.
         *
         *     A read, so no idempotency key and no version — but still `IsOperationsUser`, because queue
         *     depth by team is itself operational information and `record_access_event` should see who
         *     asked.
         */
        get: operations["operations_cases_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/checkouts/{checkout_id}/offers/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_checkouts_offers_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/compatibility-rules/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_compatibility_rule_list"];
        put?: never;
        post: operations["operations_compatibility_rule_create_draft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/compatibility-rules/{rule_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_compatibility_rule_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/compatibility-rules/{rule_id}/activate/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_compatibility_rule_activate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/compatibility-rules/{rule_id}/reject/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_compatibility_rule_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/compatibility-rules/{rule_id}/retire/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_compatibility_rule_retire"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/fulfilment-units/{unit_id}/dispatch-explanation/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_fulfilment_unit_dispatch_explanation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/fulfilment-units/{unit_id}/offers/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_fulfilment_unit_offer_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/fulfilment-units/{unit_id}/recover/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_fulfilment_unit_recover"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/kill-switches/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_kill_switches_list"];
        put?: never;
        post: operations["operations_kill_switch_engage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/kill-switches/release/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_kill_switch_release"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/ledger-adjustments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Correct the ledger by adding to it. Step-up, because an adjustment moves what is owed. */
        post: operations["operations_ledger_adjust"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/offers/{offer_id}/revoke/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_offer_revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partner-applications/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_partner_application_queue_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partner-applications/{application_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_partner_application_detail_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partner-applications/{application_id}/claim/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_partner_applications_claim_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partner-applications/{application_id}/transition/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_partner_applications_transition_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partner-documents/{document_id}/access/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_partner_documents_access_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partner-documents/{document_id}/review/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_partner_documents_review_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partners/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description Everyone who works for us, not just everyone awaiting a decision.
         *
         *     Deliberately a second surface rather than a widened review queue. The queue is a worklist —
         *     it defaults to the three in-review statuses and orders by how long somebody has waited. This
         *     is a directory: it lists approved, suspended and offboarded Partners too, ordered by name,
         *     because "find me this Partner" and "what should I review next" are different jobs and one
         *     screen doing both serves neither.
         */
        get: operations["operations_partner_directory_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partners/{partner_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description One Partner's management record.
         *
         *     Carries the same two guards the application detail does, for the same reasons: a reviewer
         *     may not open their own record, and every read is recorded — this projection names a person
         *     and summarises their documents, so who looked is itself a fact worth keeping.
         */
        get: operations["operations_partner_detail_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/partners/{partner_id}/availability/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["operations_partners_availability_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/payout-batches/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_payout_batches_list"];
        put?: never;
        post: operations["operations_payout_batch_propose"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/payout-batches/{batch_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["operations_payout_batch_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/payout-batches/{batch_id}/approve/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Maker-checker plus a fresh OTP.
         *
         *     Two different people is a control against one person acting alone. The step-up is a control
         *     against neither of them actually being present — an unlocked laptop with an Operations
         *     session open should not be able to release a week of payouts.
         */
        post: operations["operations_payout_batch_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/payout-batches/{batch_id}/cancel/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description No step-up: cancelling only returns money to the pool.
         *
         *     Making the safe direction as heavy as the dangerous one trains people to leave batches
         *     sitting approved rather than cancel a bad one.
         */
        post: operations["operations_payout_batch_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/payout-batches/{batch_id}/pay/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description The moment money starts leaving. Step-up again, because approval and payment can be
         *     hours apart and the second decision deserves its own proof of presence.
         */
        post: operations["operations_payout_batch_pay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/reservations/{reservation_id}/release/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["operations_reservation_release"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/operations/unpayable-partners/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Who is owed money and cannot be paid. The list a run is chased from. */
        get: operations["operations_unpayable_partners"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/orders/{order_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["orders_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/application/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_application_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["partner_application_partial_update"];
        trace?: never;
    };
    "/api/v1/partner/application/documents/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_application_documents_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/application/documents/uploads/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_application_documents_uploads_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/application/submit/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_application_submit_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/availability/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_availability_retrieve"];
        put: operations["partner_availability_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The Partner's own work, as a list.
         *
         *     Published because the app previously had no way to ask "what jobs do I have?"
         *     — only `GET /partner/bookings/{id}/`, which needs an id the Partner had no
         *     screen to get one from.
         *
         *     Scoped to the caller's own profile and takes no `partner_id`: the safest
         *     filter is the one a caller cannot supply, which is the same reasoning that
         *     keeps `booking_group_id` off the Partner booking projection.
         */
        get: operations["partner_booking_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_booking_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/abort/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Shared plumbing for the Partner's physical-work commands.
         *
         *     They differ only in which service they call and what they read from the body, so the
         *     version guard, idempotency key, actor resolution and projection live here once. A command
         *     that needed to opt out of any of those would be a command that should not be on this base
         *     class.
         */
        post: operations["partner_booking_abort"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/arrived/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Shared plumbing for the Partner's physical-work commands.
         *
         *     They differ only in which service they call and what they read from the body, so the
         *     version guard, idempotency key, actor resolution and projection live here once. A command
         *     that needed to opt out of any of those would be a command that should not be on this base
         *     class.
         */
        post: operations["partner_booking_arrived"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/completion/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_booking_submit_completion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/contact-attempts/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_booking_contact_attempt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/customer-unavailable/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Shared plumbing for the Partner's physical-work commands.
         *
         *     They differ only in which service they call and what they read from the body, so the
         *     version guard, idempotency key, actor resolution and projection live here once. A command
         *     that needed to opt out of any of those would be a command that should not be on this base
         *     class.
         */
        post: operations["partner_booking_customer_unavailable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/en-route/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Shared plumbing for the Partner's physical-work commands.
         *
         *     They differ only in which service they call and what they read from the body, so the
         *     version guard, idempotency key, actor resolution and projection live here once. A command
         *     that needed to opt out of any of those would be a command that should not be on this base
         *     class.
         */
        post: operations["partner_booking_en_route"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/evidence/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_booking_evidence_finalize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/evidence/uploads/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Mint a signed grant; the bytes never pass through Django on the way in.
         *
         *     The same three-step shape FE-07 established for KYC — request a grant, PUT to the bucket,
         *     finalize by object key — for the same reason: streaming megabytes of site photographs
         *     through the API server buys nothing and costs availability.
         */
        post: operations["partner_booking_evidence_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/release/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Give the job back, with a reason and no penalty attached.
         *
         *     `01-scope-and-flow.md` is explicit that M1 records a late release for manual Operations
         *     review only — there is no automatic score, no threat and nothing the Partner can see that
         *     implies one. The reason is required because recovery needs to know what happened, not to
         *     justify the Partner to the platform.
         */
        post: operations["partner_booking_release"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/scope-amendments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_booking_propose_amendment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/bookings/{booking_id}/start-otp/verify/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Shared plumbing for the Partner's physical-work commands.
         *
         *     They differ only in which service they call and what they read from the body, so the
         *     version guard, idempotency key, actor resolution and projection live here once. A command
         *     that needed to opt out of any of those would be a command that should not be on this base
         *     class.
         */
        post: operations["partner_booking_start_otp_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/business-profile/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The Partner's business identity. **`404` when none exists, and that is the ordinary state for every M1 Partner** — the client renders the individual default and offers the step rather than showing an error. */
        get: operations["m2_partner_business_profile_read"];
        /** @description Create or replace. A `PUT` rather than a `PATCH` because the three business types have genuinely different required fields, and a partial update is how a Partner switching from agency to individual keeps a registration number the database forbids. */
        put: operations["m2_partner_business_profile_replace"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/capabilities/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Every capability this Partner holds, in any status. **This is the read that tells "not applied" from "under review" from "suspended"** — an empty workspace-grant list cannot, and inferring a review banner from one would show it to every existing M1 Partner. `REJECTED` is Operations' refusal; `WITHDRAWN` is the Partner's own exit. */
        get: operations["m2_partner_capability_list"];
        put?: never;
        post: operations["m2_partner_capability_request"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/capabilities/{capability_id}/submit/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description The Partner's own submit and resubmit (`M2-BE-110`).
         *
         *     The button that was missing. Until now a capability sitting in `CHANGES_REQUIRED` could only be
         *     moved by Operations, so a Partner who fixed exactly what was asked had no way to say so and
         *     the correction cycle depended on somebody noticing. Reaching `UNDER_REVIEW` from `REQUESTED` is
         *     the first submit and from `CHANGES_REQUIRED` the resubmit; they are one command because they
         *     are one act.
         */
        post: operations["m2_partner_capability_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/capabilities/{capability_id}/withdraw/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description The Partner's own exit. Distinct from Operations' `REJECTED` refusal, which the Partner cannot cause and this route cannot reach. Neither status blocks a fresh request for the same variant. */
        post: operations["m2_partner_capability_withdraw"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/capability-options/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Business types with their consequences, and the lifecycle capabilities open for request. All copy is server-authored: `lifecycle_explanation` is the sentence that decides whether a Partner understands what they are signing up to, and `asks_for` names the fields one form should render so the client needs no archetype branch. */
        get: operations["m2_partner_capability_option_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/crew/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description This Partner's roster. Publishes **no `crew_member_id`** — identity is global, and handing the global id to one agency would let two agencies compare rosters and discover a worker is on both. `phone_masked` shows four digits; the number itself is never stored, so this is not a redaction but the whole of what exists. */
        get: operations["m2_partner_crew_list"];
        put?: never;
        /** @description Add a worker. **`201` for a new membership, `200` for a reinstated one**, so the UI can say "we put Ramesh back on your roster" instead of silently succeeding on a name the Partner thought was gone. */
        post: operations["m2_partner_crew_add"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/crew/{membership_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** @description Skills and the supervisor flag. `display_name` is **not** editable: it belongs to the global crew member, and one agency renaming a person would rename them on every other roster. */
        patch: operations["m2_partner_crew_update"];
        trace?: never;
    };
    "/api/v1/partner/crew/{membership_id}/archive/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Take a worker off this roster. **Does not yet refuse when the worker holds a future assignment**: crew assignment is per stage and the stage model arrives with `M2-BE-522`, so there is nothing to read. A guard against a table that does not exist would be a check that always passes. */
        post: operations["m2_partner_crew_archive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/crew/{membership_id}/availability/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description Mark one worker off, or back on, for one date. Exception-shaped rather than a weekly calendar because that is what a supervisor actually knows: the default is available, and what gets recorded is the wedding on the 14th. `assert_crew_available` refuses an assignment on a day marked unavailable, naming the person. */
        put: operations["m2_partner_crew_availability_set"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/demand-preview/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Live requirement summaries in the areas this Partner serves, masked. **Customer name, phone, full address, building number and the exact budget are absent from the response.** `id` is a preview identifier — a keyed hash, not a requirement primary key — and resolves on no other route. Ineligible demand is returned with a hint rather than hidden: hiding it would make an empty screen the first thing most new Partners see. An empty list is a real answer ("nothing in your area right now"), never a `404`. */
        get: operations["m2_partner_demand_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/earnings/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description What the Partner is owed, split by state.
         *
         *     One number would be a lie: money held behind an open quality case is not money you can plan
         *     around. `05-pricing-payments-and-settlement.md` also rules out on-demand withdrawal in M1, so
         *     this deliberately publishes no "withdraw" affordance — payouts run as a reviewed batch, and a
         *     button that implied otherwise would be promising something the platform does not do.
         */
        get: operations["partner_earnings_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_partner_enquiry_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_partner_enquiry_read"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/accept/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["m2_partner_enquiry_accept"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/attachments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Short-lived signed links to the requirement's **checked** attachments. Access lasts as long as the invitation holds a quote slot, and ends when it is declined, expired or withdrawn — only the selected vendor keeps it. Expiry is reported as `has_access: false` on a `200`, not as an error: the vendor still owns their enquiry record, and an empty list without that flag would read as 'the Customer attached nothing'. No link is minted once access has lapsed, because a signed URL is a bearer credential and hiding a button is not revocation. */
        get: operations["m2_partner_enquiry_attachment_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/decline/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["m2_partner_enquiry_decline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/questions/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["m2_partner_enquiry_question_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/site-visits/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Request a paid site visit. The fee is what makes a vendor willing to travel before winning the job; free visits are not offered. Charging the fee is not built until BE4 — this records the request and its fee. */
        post: operations["m2_partner_site_visit_request"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/enquiries/{invitation_id}/visit-slots/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The visit times this vendor may confirm, drawn from the **same `carts.availability` grid the A1 technician flow reads** and narrowed to this one invited vendor. Same payload shape as `POST /api/v1/booking/windows/` minus `capacity`, which on a single-vendor grid would be a readout of that vendor's own diary depth.
         *
         *     Each `id` is a **signed token** bound to this invitation and this start; it is the only thing the confirm command accepts, so a vendor cannot book a time the grid never offered or a slot drawn for a competitor. Tokens expire, so a picker left open must re-read rather than post a stale one.
         *
         *     An ineligible vendor receives a grid in which every slot reads `NO_CAPACITY` rather than an error — that is the truth and it is renderable, where a refusal would leave the screen with nothing to say.
         */
        get: operations["m2_visit_slot_list"];
        put?: never;
        /**
         * @description Commit to being on site at a specific time. **This is A5 acceptance** — it takes the quote slot and the soft capacity hold, and then a hard slot on the shared availability grid, so a visit and an A1 booking cannot double-book the same vendor.
         *
         *     The **first** confirmation on an unpaid plan holds its slot and opens the Customer's checkout (`opens_plan_checkout: true`); the visit reads `REQUESTED` until that payment is verified, and the hold lapses harmlessly if it never is. Later slots on a paid plan are confirmed outright.
         */
        post: operations["m2_visit_slot_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/gates/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The three progressive gates, each with the reason it is being asked for and the one action that clears it. **Advisory**: the commands enforce these at the moment they run, and this read only decides what the UI explains beforehand. A client treating it as authoritative would block somebody whose KYC completed thirty seconds ago. `blocks` names actions, never screens — an unsatisfied gate never hides demand. */
        get: operations["m2_partner_gate_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/insurance/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The worker-insurance declaration in force today. **`404` when none is declared, which is the ordinary state and not an error.** `verified_at` is read-only and set only by Operations: a client must render an unverified declaration as *declared*, never as *insured*, because the difference is who carries the liability if a worker is hurt. */
        get: operations["m2_partner_insurance_read"];
        /** @description Declare or replace. A replacement clears `verified_at`: swapping a checked policy for an unchecked one must not keep the badge. */
        put: operations["m2_partner_insurance_replace"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/languages/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The languages this vendor can actually work in (`M2-BE-301`).
         *
         *     Eligibility input, not profile decoration. A requirement carries the language its answers and
         *     voice note are in, and sending it to a vendor who cannot read it produces a silent non-response
         *     that looks exactly like a dead account. **Declaring nothing is not a mismatch** — matching only
         *     excludes on a declaration that contradicts the requirement, so no existing Partner is dropped
         *     from a pool for never having filled this in.
         */
        get: operations["m2_partner_language_list"];
        /** @description Replace the whole set. A merge would make removing a language impossible from the only screen that edits them. Tags are compared on their primary subtag, so `te-IN` and `te` are one language. */
        put: operations["m2_partner_language_set"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/ledger/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_ledger_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/me/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The signed-in Partner's own profile.
         *
         *     This used to return the *application* — byte-for-byte the same payload as
         *     `GET /partner/application/` — which is why "Profile" in the app opened a
         *     half-finished onboarding form. An application is a submission under review; a
         *     profile is the standing record of someone who works here.
         *
         *     404 while no profile exists yet, because an applicant who has not been set up
         *     genuinely has none, and inventing an empty one would make the app render a
         *     person who is not there.
         */
        get: operations["partner_me_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * @description Changes what a Partner may change about themselves.
         *
         *     Deliberately narrow. The phone number is the login credential and is not
         *     accepted here — see `PartnerProfileUpdateSerializer`.
         */
        patch: operations["partner_me_update"];
        trace?: never;
    };
    "/api/v1/partner/offers/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_offer_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/offers/{offer_id}/{action}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_offers_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/offers/stream/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description `GET /api/v1/partner/offers/stream/` — see the contract proposal.
         *
         *     Same authentication and permissions as `GET /api/v1/partner/offers/`.
         *     `EventSource` cannot send custom headers, so this relies on the session cookie
         *     the partner app already holds — which is also why the permission check happens
         *     here, before the generator, rather than inside it.
         */
        get: operations["partner_offer_stream"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/payout-account/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The Partner's own account, masked.
         *
         *     Read-only here on purpose. Registering or changing an account starts a cooling period and is
         *     the event an account-takeover investigation begins from, so it goes through the reviewed
         *     onboarding path rather than a self-service PATCH nobody watches.
         */
        get: operations["partner_payout_account_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/performance/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The numbers the Partner home screen is built from.
         *
         *     Separate from `earnings/`, which answers "what am I owed" — a balance by
         *     state. This answers "how am I doing" — throughput and revenue over time.
         *     Both are aggregates over the same ledger, and folding them into one payload
         *     would make a screen that only wants today's total pull a full balance
         *     breakdown it does not render.
         *
         *     No `partner_id`: the Partner is resolved from the session, which is the one
         *     filter a caller cannot get wrong.
         */
        get: operations["partner_performance_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/presence/heartbeat/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_presence_heartbeat_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/presence/offline/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_presence_offline_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/presence/online/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["partner_presence_online_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/questions/{question_id}/answer/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Answer a question the Customer asked about one of your quotes. Scoped to this vendor's own enquiries, and refuses a question this vendor asked — an answer to your own question would close the row without the Customer ever seeing it. */
        post: operations["m2_partner_question_answer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/required-consents/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_required_consents_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/skills/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_skills_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/workspaces/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The Partner's approved lifecycle capabilities as `{workspace_key, commercial_mode, actions[]}`. Drives navigation and nothing else: no routes, no labels, no icons. A Partner with no approved capability receives `200 {"workspaces": []}` — that is a real, common state (registered, not yet reviewed), not an error. Suspension is expressed by omitting the workspace or reducing its actions, never by an error, so navigation degrades in place rather than blanking mid-session. */
        get: operations["m2_partner_workspace_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-attempts/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["payment_attempts_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-attempts/{attempt_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["payment_attempts_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-attempts/{attempt_id}/reconcile/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["payment_attempts_reconcile_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-attempts/{attempt_id}/simulate-capture/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Marks a payment captured with no gateway. Development only.
         *
         *     Published so the flow is drivable end to end without provider credentials.
         *     It is fail-closed three ways — a settings flag off by default, a production
         *     start-up guard that refuses to boot with it on, and a check that the attempt's
         *     own provider is `fake` — and it runs the *real* capture path rather than
         *     setting a status, so everything capture triggers actually happens.
         *
         *     `404` rather than `403` when disabled: an environment that does not do this
         *     should not advertise that the door exists.
         */
        post: operations["payment_attempt_simulate_capture"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/payment-webhooks/razorpay/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["payment_webhooks_razorpay_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/plan-quotes/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["plan_quotes_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/plan-quotes/{quote_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["plan_quotes_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/proposals/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Every quote this vendor has submitted, newest first. **This closes the largest hole in the Partner surface**: until 1.24.0 a vendor could submit a quote and read it back only by remembering its id, so withdraw, the six proposal states and the whole supersession trace ended when the tab closed. */
        get: operations["m2_proposal_list"];
        put?: never;
        /** @description Submit a quote, or a revision that supersedes this vendor's previous one. Proposals are append-only: a revision never overwrites what the Customer was originally offered. The archetype decides which fields are required and the server enforces it. */
        post: operations["m2_proposal_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/proposals/{proposal_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_proposal_read"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/proposals/{proposal_id}/withdraw/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["m2_proposal_withdraw"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/quotes/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["quotes_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/refunds/{refund_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["refunds_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_requirement_list"];
        put?: never;
        post: operations["m2_requirement_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_requirement_read"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: operations["m2_requirement_update"];
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/attachments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Turn a completed upload into an attachment, after verifying what actually arrived. */
        post: operations["m2_requirement_attachment_finalize"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/attachments/{attachment_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description Remove an attachment and delete the stored object. Refused after the requirement leaves DRAFT, because a vendor was invited against a snapshot and removing a photograph they quoted on rewrites the question after the answer. An `INFECTED` attachment is removable in any state. */
        delete: operations["m2_requirement_attachment_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/attachments/uploads/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Ask for a signed upload URL. The server names the object key and records the size, media type and SHA-256 the client declares; finalization streams the stored object back and refuses anything that does not match. `scan_status` is `PENDING` on arrival because the object does not exist yet. */
        post: operations["m2_requirement_attachment_upload_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/quotes/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Every quote (A3) or on-site estimate (A5) in full: scope, line items, stages, taxes, validity and the vendor's identity. **Entitlement is enforced here, not hidden in the UI** — an A3 request needs an active unlock and an A5 request needs a charged visit plan, and without one this refuses rather than returning a shortened payload. Contact details are not in this response at any status; they are released by the engagement, not by the fee. */
        get: operations["m2_quote_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/questions/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Ask the professional behind one quote or estimate a question. Structured clarification, not chat: one question, one answer, both on the shared timeline.
         *
         *     Addressed to a **proposal**, so it reaches the vendor who wrote it rather than broadcasting to a pool that has already quoted. Gated on the paywall the archetype uses — before the unlock (A3) or the charged plan (A5) the vendors are deliberately not addressable, and a question would be a channel around the fee.
         *
         *     A question never changes a price. A new number is a superseding proposal.
         */
        post: operations["m2_customer_question_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/reject/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Refuse a quote. `NOT_CHOSEN` is bookkeeping — the Customer preferred somebody else and nothing further happens. `NON_RESPONSIVE` is the control against slot squatting: it releases the vendor's slot and buys a replacement **at no extra charge** — a new quote slot on A3, a free replacement visit on A5 — up to a configured cap. */
        post: operations["m2_quote_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/quotes/{proposal_id}/revalidate/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Ask this vendor to put a fresh price on a quote whose validity has passed. **This charges nothing and reuses the unlock or visit plan already paid for** — expiry must not be a dead end that forces a second purchase. The vendor answers by superseding the quote; the expired revision stays readable and stays unselectable, because only a vendor can state a price. */
        post: operations["m2_quote_revalidate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/quotes/teasers/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Pre-unlock quote teasers. This payload is sent to a Customer who has paid nothing, so vendor name, contact, scope, line items and the exact total are absent from the response — not merely unrendered. */
        get: operations["m2_quote_teaser_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/selection/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The live selection for this request, or `null`. `reconfirm_by` is the vendor's deadline; `engagement_id` fills in once they reconfirm. */
        get: operations["m2_selection_read"];
        put?: never;
        /** @description Choose one vendor. **Selection is not a booking**: it starts the vendor's reconfirmation clock, and the engagement opens only when they commit — A3 on their reconfirmation, A5 when the first stage is funded. If they decline or the clock runs out, the unlock or visit-plan entitlement survives untouched and the next quote costs nothing more. Multiple simultaneous selections are not supported. */
        post: operations["m2_selection_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/submit/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["m2_requirement_submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/timeline/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_requirement_timeline"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/unlock/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The unlock state for one A3 request. `unlock` is `null` until a checkout has been started, and reaching `ACTIVE` requires a **verified provider callback** — a client redirect saying the payment succeeded never grants access. `price_paise` is `null` when Operations has loaded no effective price, which is a real state while the tier prices are an open owner decision: the screen says we cannot offer this yet rather than showing a number nobody approved. */
        get: operations["m2_unlock_read"];
        put?: never;
        /** @description Start the charge that unlocks delivered quotes. **A3 only**, and refused unless at least one usable quote is live at this instant — that is what makes 'paid but nothing happened' unreachable rather than merely unlikely. Repeating the call while a previous attempt is still pending returns that attempt rather than starting a second charge. */
        post: operations["m2_unlock_checkout_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/vendor-cards/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * @description The professionals responding to one A5 request. **A5 only** — an A3 request's pre-unlock surface is the quote teaser, and a second one would be a way around the unlock.
         *
         *     The ladder, exactly: verification badge, vendor type and a coarse distance band for every responding vendor; the vendor's **name once they have committed to a visit slot**, because somebody entering a home has to be nameable; and **no contact details at any status**, which the engagement releases and the plan fee does not.
         *
         *     `distance_band_km` is the 5 km band the matcher ranked on, read back from the invitation's own provenance rather than recomputed, and is `null` when we have no fresh position for that vendor — the ordinary case for an agency that never runs the technician app. **No rating is published**: this platform has no review model, and a number with nothing behind it is worse than none.
         */
        get: operations["m2_vendor_card_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/visit-plan/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description The visit plan for one A5 request. Before a plan is chosen this carries `available_tiers` — the priced options for the review screen's chooser, and an **empty list is the honest answer** while the owner has priced no tier. After a plan exists it carries the plan, its per-slot shares and the confirmed visits with their scheduled times. Choosing a plan charges nothing; the whole plan is charged once, at the first confirmed visit slot. */
        get: operations["m2_visit_plan_read"];
        put?: never;
        /** @description Choose how many verified professionals will visit and estimate on site: one, two or three. **This charges nothing** — it bounds the invitation wave and snapshots the price the Customer was shown, so a price loaded between choosing and the first vendor confirming cannot silently become what they pay. Re-choosing is allowed while no vendor has committed to a slot. A5 only; an A3 request has no visit plan. */
        post: operations["m2_visit_plan_choose"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/{requirement_id}/visit-plan/checkout/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Pay for the whole visit plan, once, against a slot a vendor has actually committed to. The first vendor's slot is held while this completes and **lapses harmlessly if the Customer never pays** — nothing was charged and the vendor's time returns to the availability grid. The held slot hardens to `SCHEDULED` only on the verified provider callback. Later vendors book without any further payment. */
        post: operations["m2_visit_plan_checkout_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/duplicate-check/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["m2_requirement_duplicate_check"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/requirements/questions/{question_id}/answer/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Answer a question a professional asked about this request. Since 1.26.0 clarification runs both ways, so this route answers **the vendor's** questions only: a Customer's own question is answered by the vendor at `POST /api/v1/partner/questions/{question_id}/answer/`. */
        post: operations["m2_requirement_question_answer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scope-amendments/{amendment_id}/approve/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Approve or decline proposed extra work.
         *
         *     Approval is not a state flag — it mints the `PriceRevision` and its `PaymentAttempt` in the
         *     same transaction, so a Customer cannot approve work that never gets billed. The response
         *     carries the attempt id because the client's next step is to pay it.
         */
        post: operations["scope_amendment_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scope-amendments/{amendment_id}/decline/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Approve or decline proposed extra work.
         *
         *     Approval is not a state flag — it mints the `PriceRevision` and its `PaymentAttempt` in the
         *     same transaction, so a Customer cannot approve work that never gets billed. The response
         *     carries the attempt id because the client's next step is to pay it.
         */
        post: operations["scope_amendment_decline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/selections/{selection_id}/decline/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Decline after being chosen. The quote is marked `LAPSED` rather than `REJECTED` — a rejection is the Customer's refusal, and a vendor reading it against their own decision would be told the wrong story about their own standing. The Customer's unlock or visit plan survives and the next quote costs nothing more. */
        post: operations["m2_selection_decline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/selections/{selection_id}/reconfirm/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Confirm price, date and capacity after being chosen. **Everything is re-checked here** rather than trusted from quoting time: the capability against this request's own area and start date, the vendor's diary on the shared availability grid, and the quote's validity. A vendor whose approval lapsed in between must not end up holding authorised money against unauthorised work. */
        post: operations["m2_selection_reconfirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/service-areas/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["service_areas_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/serviceability/check/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["serviceability_check_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/{service_slug}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["services_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/services/{service_slug}/configuration/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Stable configuration endpoint retained separately for booking-workspace caching. */
        get: operations["services_configuration_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/site-visits/{site_visit_id}/arrival/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Record that the vendor is on site. Either party may confirm it. M2 uses the **non-OTP fallback** as the default path rather than as a degraded one — the start OTP is M3 activation — and `arrival_method` is stored so every historical arrival still says truthfully how it was proved once the OTP path is switched on. */
        post: operations["m2_site_visit_arrival_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/site-visits/{site_visit_id}/complete/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Only the vendor closes a visit, because only the vendor attended it.
         *
         *     Scheduling takes both parties; completion is a report of what happened, and the party that
         *     travelled is the one who can make it. A Customer who disagrees with the outcome has the
         *     clarification timeline and, from Wave C6, a case — not a competing completion.
         */
        post: operations["m2_site_visit_complete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/site-visits/{site_visit_id}/no-show/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * @description Report that the other party did not turn up. **You report the other side's absence, never your own** — a Customer reports `VENDOR`, a vendor reports `CUSTOMER` — because the report is a statement by the party who was there.
         *
         *     The two settle differently. A vendor no-show costs the Customer nothing: the slot goes back to owing a **free replacement visit**. A customer no-show still pays the vendor their visit payout — they travelled — and only the platform's share is in question, which is an owner decision read fail-closed.
         */
        post: operations["m2_site_visit_no_show_report"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/site-visits/{site_visit_id}/schedule/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Put a time on a requested visit, or move one already scheduled. Either party may call it: the vendor proposes a slot they can travel in, the Customer confirms a time somebody will be on site, and neither can do it alone. */
        post: operations["m2_site_visit_schedule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/tax-documents/{document_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["tax_documents_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        A1TaskLine: {
            readonly code: string;
            readonly label: string;
            readonly unit_price: components["schemas"]["Money"];
            readonly marginal_duration_minutes: number;
        };
        /**
         * @description What a client needs to hand a charge to the payment provider, and nothing more.
         *
         *     No provider payload, no key, no signature — `M2-BE-415` asks for payment status without
         *     leaking provider internals, and the order id plus the amount is the whole of what a checkout
         *     sheet needs. **The status here is never the grant.** `PROVIDER_PENDING` and `CAPTURED` describe
         *     the *attempt*; whether the Customer actually has an unlock or a charged plan is the `unlock` or
         *     `visit_plan` object beside it, and only a verified callback moves that.
         */
        AccessCheckout: {
            /** Format: uuid */
            readonly payment_attempt_id: string;
            readonly amount_paise: number;
            readonly currency: string;
            readonly provider: string;
            readonly provider_order_id: string;
            readonly status: string;
            /** Format: date-time */
            readonly expires_at: string | null;
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description The durable reference for the access fee Vsolve actually collected (`M2-BE-415`).
         *
         *     Not an invoice. `TaxDocument.order` is not nullable and an access fee has no `Order`, so making
         *     it nullable to fit one would weaken the invariant every M1 invoice depends on; the number comes
         *     from the same `commerce.DocumentSequence` under an `M2A-` series, which is gapless and is the
         *     one numbering authority. GST treatment of the unlock and the visit-plan fee is blocking owner
         *     decision 5, so this is a receipt reference and says so.
         *
         *     `number` is formatted server-side in the `series-sequence` shape
         *     `commerce.TaxDocumentSerializer.get_number` already publishes, because the string a Customer
         *     quotes to support should not be assembled differently by each app that renders it.
         */
        AccessReceipt: {
            readonly kind: string;
            readonly number: string;
            readonly series: string;
            readonly sequence: number;
            readonly amount_paise: number;
        };
        /**
         * @description * `KEEP_CUSTOMER` - KEEP_CUSTOMER
         *     * `KEEP_SESSION` - KEEP_SESSION
         *     * `KEEP_BOTH` - KEEP_BOTH
         * @enum {string}
         */
        ActionEnum: "KEEP_CUSTOMER" | "KEEP_SESSION" | "KEEP_BOTH";
        ActiveRole: {
            readonly active_role: string | null;
        };
        Address: {
            /** Format: uuid */
            readonly id: string;
            label: string;
            line1: string;
            line2?: string;
            landmark?: string;
            locality: string;
            city: string;
            state: string;
            postal_code: string;
            country_code?: string;
            /** Format: decimal */
            latitude: string;
            /** Format: decimal */
            longitude: string;
            source?: components["schemas"]["SourceEnum"];
            /** Format: date-time */
            readonly confirmed_at: string;
            is_default?: boolean;
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly updated_at: string;
        };
        AddressRequest: {
            label: string;
            line1: string;
            line2?: string;
            landmark?: string;
            locality: string;
            city: string;
            state: string;
            postal_code: string;
            country_code?: string;
            /** Format: decimal */
            latitude: string;
            /** Format: decimal */
            longitude: string;
            source?: components["schemas"]["SourceEnum"];
            is_default?: boolean;
        };
        AmendmentApprovalResult: {
            amendment: components["schemas"]["ScopeAmendment"];
            /** Format: uuid */
            payment_attempt_id: string;
            amount_paise: number;
            currency: string;
        };
        /**
         * @description One line of a change request, priced.
         *
         *     `amount_paise` is signed on the wire even though the stored column is not: the M1
         *     `ScopeAmendmentLine` was built for additions only, so it holds an absolute value and the sign
         *     lives in the line's snapshot. Publishing the signed number is what lets one screen render both
         *     an addition and a reduction without knowing which table the sign came from.
         */
        AmendmentLine: {
            readonly position: number;
            readonly kind: string;
            readonly title: string;
            readonly quantity: number;
            readonly amount_paise: number;
        };
        AmendmentLineInputRequest: {
            title: string;
            quantity: number;
            amount_paise?: number | null;
        };
        ApiError: {
            readonly error: components["schemas"]["ApiErrorDetail"];
        };
        ApiErrorDetail: {
            readonly code: string;
            readonly message: string;
            readonly details: unknown;
            readonly retryable: boolean;
            readonly request_id: string | null;
        };
        /**
         * @description The person coming, as the Customer may see them.
         *
         *     Deliberately thin. A Partner's phone number, documents and application are
         *     theirs; what a Customer needs is who is arriving and what they do. There is
         *     no rating here because the platform has no review model yet — publishing a
         *     number with nothing behind it would be worse than publishing none.
         */
        AssignedProfessional: {
            display_name: string;
            headline: string;
            experience_years: number;
        };
        AssistedCheckoutCreateRequest: {
            /** Format: uuid */
            customer_id: string;
            /** Format: uuid */
            quote_id: string;
            consent_purpose: string;
            consent_version: string;
        };
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        AssistedStartRequestRequest: {
            expected_version: number;
            outage_reason: string;
        };
        AttachmentFinalizeRequest: {
            /** Format: uuid */
            upload_id: string;
        };
        /** @description The signed-upload grant. Bytes go to storage, never through Django. */
        AttachmentUploadGrant: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: string;
            /** Format: uri */
            readonly upload_url: string;
            readonly upload_token: string;
            /** Format: date-time */
            readonly upload_expires_at: string;
            readonly scan_status: string;
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description What the client declares before any bytes exist.
         *
         *     The checksum is required, and it is the point of the whole handshake: finalization streams the
         *     stored object back and compares it against these three values, so an upload that swapped the
         *     file after presigning is refused rather than stored. Without them "verify the upload" would mean
         *     "believe the client".
         */
        AttachmentUploadRequestRequest: {
            kind: components["schemas"]["RequirementAttachmentKindEnum"];
            content_type: string;
            size_bytes: number;
            sha256: string;
            /** @default  */
            language: string;
        };
        AuthenticatedSession: {
            readonly user: components["schemas"]["User"];
            readonly active_role: string;
            /** Format: date-time */
            readonly session_expires_at: string;
        };
        /** @enum {unknown} */
        BlankEnum: "";
        Booking: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string | null;
            /** Format: uuid */
            readonly reservation_id: string;
            /** Format: uuid */
            readonly partner_id: string;
            /** Format: date-time */
            readonly scheduled_start: string;
            readonly estimated_duration_minutes: number;
            /** Format: date-time */
            readonly created_at: string;
        };
        BookingCancellationResult: {
            booking: components["schemas"]["CustomerBooking"];
            refund_ids: string[];
        };
        BookingGroup: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["BookingGroupStatusEnum"];
            readonly version: number;
            readonly confirmation_policy: components["schemas"]["ConfirmationPolicyEnum"];
            /** Format: date-time */
            readonly expires_at: string;
            /** Format: date-time */
            readonly server_now: string;
            readonly recovery_action: components["schemas"]["RecoveryActionEnum"];
            /** Format: date-time */
            readonly next_transition_at: string | null;
            /** Format: uuid */
            readonly checkout_id: string | null;
            readonly checkout_version: number | null;
            /** Format: uuid */
            readonly order_id: string | null;
            readonly units: components["schemas"]["FulfilmentUnit"][];
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly updated_at: string;
        };
        BookingGroupCancelRequest: {
            expected_version: number;
        };
        BookingGroupPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["BookingGroup"][];
        };
        /**
         * @description * `CONFIRMED` - Confirmed
         *     * `MATCHING` - Matching
         *     * `PARTIALLY_HELD` - Partially held
         *     * `ALL_UNITS_HELD` - All units held
         *     * `PAYMENT_PENDING` - Payment pending
         *     * `BOOKED` - Booked
         *     * `COMPLETED` - Completed
         *     * `REPLAN_REQUIRED` - Replan required
         *     * `CANCELLED` - Cancelled
         *     * `EXPIRED` - Expired
         *     * `FAILED` - Failed
         * @enum {string}
         */
        BookingGroupStatusEnum: "CONFIRMED" | "MATCHING" | "PARTIALLY_HELD" | "ALL_UNITS_HELD" | "PAYMENT_PENDING" | "BOOKED" | "COMPLETED" | "REPLAN_REQUIRED" | "CANCELLED" | "EXPIRED" | "FAILED";
        /**
         * @description * `CONFIRMED` - Confirmed
         *     * `EN_ROUTE` - En route
         *     * `ARRIVED` - Arrived
         *     * `IN_PROGRESS` - In progress
         *     * `COMPLETION_SUBMITTED` - Completion submitted
         *     * `COMPLETED` - Completed
         *     * `PARTIALLY_COMPLETED` - Partially completed
         *     * `DISPUTED` - Disputed
         *     * `RECOVERY_REQUIRED` - Recovery required
         *     * `ABORTED` - Aborted
         *     * `CANCELLED` - Cancelled
         * @enum {string}
         */
        BookingStatusEnum: "CONFIRMED" | "EN_ROUTE" | "ARRIVED" | "IN_PROGRESS" | "COMPLETION_SUBMITTED" | "COMPLETED" | "PARTIALLY_COMPLETED" | "DISPUTED" | "RECOVERY_REQUIRED" | "ABORTED" | "CANCELLED";
        BookingStatusHistory: {
            /** Format: uuid */
            readonly id: string;
            readonly command: string;
            readonly from_status: string;
            readonly to_status: string;
            readonly reason: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        BookingWindow: {
            readonly id: string;
            /** Format: date-time */
            readonly starts_at: string;
            /** Format: date-time */
            readonly ends_at: string;
            readonly is_available: boolean;
            readonly unavailable_reason: (components["schemas"]["UnavailableReasonEnum"] | components["schemas"]["NullEnum"]) | null;
            readonly capacity: number;
        };
        BookingWindowDay: {
            /** Format: date */
            readonly date: string;
            readonly is_today: boolean;
            readonly windows: components["schemas"]["BookingWindow"][];
        };
        BookingWindows: {
            /** Format: date-time */
            readonly server_now: string;
            readonly estimated_duration_minutes: number;
            readonly availability_is_preliminary: boolean;
            readonly timezone: string;
            readonly days: components["schemas"]["BookingWindowDay"][];
        };
        BookingWindowsRequestRequest: {
            /** Format: uuid */
            address_id: string;
            group_key?: string;
        };
        BusinessTypeOption: {
            readonly value: string;
            readonly label: string;
            readonly consequence: string;
        };
        CancellationBand: {
            readonly code: string;
            readonly condition_text: string;
            readonly fee: components["schemas"]["Money"];
        };
        CancellationPolicy: {
            readonly code: string;
            readonly version: number;
            readonly bands: components["schemas"]["CancellationBand"][];
            readonly reschedule_free_notice_hours: number;
        };
        /**
         * @description What cancelling this visit would cost and return, as of now.
         *
         *     Every figure is the server's. A browser cannot read the frozen band ladder or the live
         *     payment allocations, so a client that computed either would be inventing the number it then
         *     asked the Customer to accept.
         */
        CancellationPreview: {
            band_code: string;
            fee_paise: number;
            fee_waiver: string;
            refund_paise: number;
            currency: string;
        };
        CapabilityOption: {
            /** Format: uuid */
            readonly variant_id: string;
            readonly variant_name: string;
            readonly category_name: string;
            readonly workspace_key: string;
            readonly commercial_mode: string;
            readonly lifecycle_explanation: string;
            readonly requires_insurance: boolean;
            readonly asks_for: string[];
            readonly registration_questions: unknown[];
            readonly already_requested: boolean;
        };
        CapabilityOptions: {
            readonly business_types: components["schemas"]["BusinessTypeOption"][];
            readonly capabilities: components["schemas"]["CapabilityOption"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        CapabilityRequestRequest: {
            /** Format: uuid */
            variant_id: string;
            max_crew_size?: number | null;
            max_project_value_paise?: number | null;
            service_area_ids?: string[];
            registration_answers?: unknown;
        };
        /**
         * @description Submit or resubmit one capability for review.
         *
         *     `registration_answers` is optional so a resubmit that only fixed a document does not have to
         *     resend the answers. Sending them replaces the stored set and revalidates it.
         */
        CapabilitySubmitRequest: {
            registration_answers?: unknown;
        };
        /**
         * @description The last decision on a capability, with its date and reason.
         *
         *     Published without an `actor_kind`, deliberately. `PartnerCapabilityTransition.actor` is null
         *     both for a Partner's own action and for a system job, so a computed actor would confidently
         *     mislabel the case the client most needs to get right. The **status** now answers who:
         *     `REJECTED` is Operations and `WITHDRAWN` is the Partner. See proposal 0013 section "Answered".
         */
        CapabilityTransitionSummary: {
            readonly to_status: string;
            readonly reason_code: string;
            readonly reason: string;
            /** Format: date-time */
            readonly occurred_at: string;
        };
        Cart: {
            /** Format: uuid */
            readonly id: string;
            readonly version: number;
            readonly items: components["schemas"]["CartItemDetail"][];
            readonly estimate: components["schemas"]["CartPriceSummary"] | null;
            /** Format: date-time */
            readonly updated_at: string;
        };
        CartItem: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly variant_id: string;
            readonly quantity: number;
            readonly scope_schema_snapshot: unknown;
        };
        CartItemCreateRequest: {
            expected_cart_version: number;
            /** Format: uuid */
            variant_id: string;
            quantity: number;
            scope?: {
                [key: string]: unknown;
            };
        };
        CartItemDetail: {
            /** Format: uuid */
            readonly id: string;
            readonly version: number;
            /** Format: uuid */
            readonly variant_id: string;
            readonly service_slug: string;
            readonly service_name: string;
            readonly variant_name: string;
            readonly quantity: number;
            readonly amount: components["schemas"]["Money"] | null;
            readonly scope: {
                [key: string]: unknown;
            };
            readonly scope_schema_snapshot: unknown;
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly updated_at: string;
        };
        CartItemInputRequest: {
            /** Format: uuid */
            variant_id: string;
            quantity: number;
            scope?: {
                [key: string]: unknown;
            };
            /** @default false */
            replace_existing: boolean;
        };
        CartItemRemoveRequest: {
            expected_cart_version: number;
            expected_item_version: number;
        };
        CartMergeDecisionRequest: {
            /** Format: uuid */
            session_item_id: string;
            action: components["schemas"]["ActionEnum"];
        };
        CartMergeRequest: {
            expected_customer_cart_version: number;
            expected_session_cart_version: number;
            decisions: components["schemas"]["CartMergeDecisionRequest"][];
        };
        CartMoney: {
            amount_paise: number;
            currency: string;
        };
        /**
         * @description What the cart costs right now, as an estimate.
         *
         *     Named `estimate` on the wire and nowhere called a quote. A `Quote` needs an address and a
         *     chosen arrival window and is the only number anybody is held to; this applies the same
         *     policy and the same arithmetic to what a cart actually knows, so the two agree unless
         *     something real differs.
         *
         *     `minimum_visit_topup` is published rather than folded into the subtotal, because a customer
         *     who sees a ₹49 floor added to a ₹29 job is owed the reason.
         */
        CartPriceSummary: {
            subtotal: components["schemas"]["CartMoney"];
            minimum_visit_topup: components["schemas"]["CartMoney"];
            platform_fee: components["schemas"]["CartMoney"];
            tax: components["schemas"]["CartMoney"];
            total: components["schemas"]["CartMoney"];
        };
        /**
         * @description Services one Partner could add to a visit this cart already has.
         *
         *     `suggestions` reuses the catalog's own `ServiceCard`, so the cart renders the
         *     same card the catalog does rather than a second, drifting shape. An empty list
         *     is a real answer and the client renders nothing for it.
         */
        CartSuggestions: {
            cart_version: number;
            suggestions: components["schemas"]["ServiceCard"][];
        };
        CaseNoteRequestRequest: {
            body: string;
            /** @default false */
            is_communication: boolean;
        };
        /**
         * @description The Operations home screen, counted over the whole queue rather than one page.
         *
         *     Every field here is an aggregate the console cannot compute for itself: the case list is
         *     cursor-paginated, so a client counting its own rows would publish "the first fifty" as a
         *     total. `server_now` travels with the counts because the screen renders relative deadlines,
         *     and a clock-skewed browser would otherwise turn a real number into a wrong one.
         */
        CaseQueueSummary: {
            /** Format: date-time */
            server_now: string;
            breaching_sla: number;
            oldest_overdue_minutes: number | null;
            mine_open: number;
            mine_due_soon: number;
            holding_payout: number;
            teams: components["schemas"]["TeamQueue"][];
        };
        Category: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly description: string;
            readonly icon_key: string;
            readonly subcategories: components["schemas"]["Subcategory"][];
        };
        /**
         * @description * `SMS` - SMS
         *     * `EMAIL` - Email
         * @enum {string}
         */
        ChannelEnum: "SMS" | "EMAIL";
        Checkout: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["CheckoutStatusEnum"];
            readonly version: number;
            /** Format: date-time */
            readonly expires_at: string;
            readonly booking_group: components["schemas"]["BookingGroup"] | null;
            /** Format: date-time */
            readonly created_at: string;
        };
        CheckoutCreateRequest: {
            /** Format: uuid */
            quote_id: string;
        };
        /**
         * @description * `CREATED` - Created
         *     * `FINDING_PARTNER` - Finding partner
         *     * `PARTNER_COMMITTED` - Partner committed
         *     * `PAYMENT_PENDING` - Payment pending
         *     * `COMPLETED` - Completed
         *     * `REPLAN_REQUIRED` - Replan required
         *     * `CANCELLED` - Cancelled
         *     * `EXPIRED` - Expired
         * @enum {string}
         */
        CheckoutStatusEnum: "CREATED" | "FINDING_PARTNER" | "PARTNER_COMMITTED" | "PAYMENT_PENDING" | "COMPLETED" | "REPLAN_REQUIRED" | "CANCELLED" | "EXPIRED";
        CommunicationPreference: {
            channel: components["schemas"]["ChannelEnum"];
            purpose: string;
            is_enabled?: boolean;
            /** Format: date-time */
            readonly updated_at: string;
        };
        CommunicationPreferenceRequest: {
            channel: components["schemas"]["ChannelEnum"];
            purpose: string;
            is_enabled?: boolean;
        };
        CompatibilityRule: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly left_variant_id: string;
            readonly left_service_name: string;
            readonly left_variant_name: string;
            /** Format: uuid */
            readonly right_variant_id: string;
            readonly right_service_name: string;
            readonly right_variant_name: string;
            readonly version: number;
            readonly mode: components["schemas"]["ModeEnum"];
            readonly dependency: components["schemas"]["DependencyEnum"];
            readonly conditions: unknown;
            /** Format: date-time */
            readonly effective_from: string;
            /** Format: date-time */
            readonly effective_to: string | null;
            readonly lifecycle_status: components["schemas"]["LifecycleStatusEnum"];
            readonly change_reason: string;
            /** Format: uuid */
            readonly created_by_id: string | null;
            /** Format: uuid */
            readonly reviewed_by_id: string | null;
            /** Format: date-time */
            readonly reviewed_at: string | null;
            readonly review_reason: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        CompatibilityRuleDraftRequest: {
            /** Format: uuid */
            left_variant_id: string;
            /** Format: uuid */
            right_variant_id: string;
            mode: components["schemas"]["ModeEnum"];
            /** @default NONE */
            dependency: components["schemas"]["DependencyEnum"];
            conditions?: {
                [key: string]: unknown;
            };
            /** Format: date-time */
            effective_from: string;
            /** Format: date-time */
            effective_to?: string | null;
            change_reason: string;
        };
        CompatibilityRulePage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["CompatibilityRule"][];
        };
        CompatibilityRuleRetireRequest: {
            expected_version: number;
            reason: string;
        };
        CompatibilityRuleReviewRequest: {
            expected_version: number;
            review_reason: string;
        };
        CompletionResponse: {
            /** Format: uuid */
            readonly id: string;
            readonly decision: components["schemas"]["CompletionResponseDecisionEnum"];
            readonly dispute_reason: string;
            /** Format: date-time */
            readonly responded_at: string;
        };
        /**
         * @description * `CONFIRMED` - Confirmed
         *     * `DISPUTED` - Disputed
         *     * `AUTO_FINALIZED` - Auto-finalized
         * @enum {string}
         */
        CompletionResponseDecisionEnum: "CONFIRMED" | "DISPUTED" | "AUTO_FINALIZED";
        CompletionSubmission: {
            /** Format: uuid */
            readonly id: string;
            readonly notes: string;
            readonly safety_damage_declared: boolean;
            /** Format: date-time */
            readonly submitted_at: string;
            /** Format: date-time */
            readonly responds_by: string;
            readonly outcomes: components["schemas"]["WorkOutcome"][];
            readonly response: components["schemas"]["CompletionResponse"] | null;
        };
        /**
         * @description * `ALL_OR_NOTHING` - All or nothing
         * @enum {string}
         */
        ConfirmationPolicyEnum: "ALL_OR_NOTHING";
        ConsentReceipt: {
            /** Format: uuid */
            readonly id: string;
            readonly purpose: string;
            readonly policy_version: string;
            /** Format: date-time */
            readonly accepted_at: string;
            /** Format: date-time */
            readonly withdrawn_at: string | null;
        };
        ConsentReceiptCreateRequest: {
            purpose: string;
            policy_version: string;
        };
        /**
         * @description * `image/jpeg` - image/jpeg
         *     * `image/png` - image/png
         *     * `application/pdf` - application/pdf
         * @enum {string}
         */
        ContentTypeEnum: "image/jpeg" | "image/png" | "application/pdf";
        CrewAvailability: {
            /** Format: uuid */
            readonly id: string;
            /** Format: date */
            readonly date: string;
            readonly is_available: boolean;
            readonly reason: string;
            /** Format: date-time */
            readonly recorded_at: string;
        };
        CrewAvailabilityWriteRequest: {
            /** Format: date */
            date: string;
            is_available: boolean;
            reason?: string;
        };
        CrewList: {
            readonly members: components["schemas"]["CrewMember"][];
        };
        /**
         * @description One worker on this Partner's roster.
         *
         *     **`crew_member_id` is deliberately absent.** Identity is global - `CrewMember.identity_hash` -
         *     and publishing the global id to one agency would let two agencies correlate rosters and discover
         *     that a worker is on both. `membership_id` is per-Partner and is what every command takes.
         *
         *     `phone_masked` rather than the number. The Partner supplied it, so this is not a leak in the
         *     quote-teaser sense, but the roster is read on a shared site phone and an unmasked list is a
         *     contact export waiting to happen. The Partner who needs the full number already has it.
         */
        CrewMember: {
            /** Format: uuid */
            readonly membership_id: string;
            readonly display_name: string;
            readonly phone_masked: string;
            readonly status: string;
            readonly is_supervisor: boolean;
            readonly skill_codes: string[];
            /** Format: date-time */
            readonly documents_verified_at: string | null;
            /** Format: date-time */
            readonly added_at: string;
        };
        CrewMemberCreateRequest: {
            display_name: string;
            phone_e164: string;
            skill_codes?: string[];
            /** @default false */
            is_supervisor: boolean;
        };
        CsrfToken: {
            readonly csrf_token: string;
        };
        /**
         * @description One visit, as the Customer who paid for it sees it.
         *
         *     Carries the Partner's display name and nothing else about them — not their phone number,
         *     not their earnings, not their other jobs. `G7` in the frontend task file is the same rule
         *     from the other side: Customer projections contain no Partner identity beyond what is needed
         *     to recognise the person at the door.
         */
        CustomerBooking: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string | null;
            readonly status: components["schemas"]["BookingStatusEnum"];
            readonly version: number;
            /** Format: date-time */
            readonly scheduled_start: string;
            readonly estimated_duration_minutes: number;
            readonly partner_display_name: string | null;
            /** Format: date-time */
            readonly en_route_at: string | null;
            /** Format: date-time */
            readonly arrived_at: string | null;
            /** Format: date-time */
            readonly late_declared_at: string | null;
            /** Format: date-time */
            readonly cancelled_at: string | null;
            readonly cancellation_reason: string;
            readonly work_tasks: components["schemas"]["WorkTask"][];
            readonly active_amendment: components["schemas"]["ScopeAmendment"] | null;
            readonly completion: components["schemas"]["CompletionSubmission"] | null;
            readonly cancellation_preview: components["schemas"]["CancellationPreview"] | null;
            readonly reschedule_preview: components["schemas"]["ReschedulePreview"] | null;
            /** Format: date-time */
            readonly server_now: string;
        };
        CustomerContactAttemptRequestRequest: {
            outcome: string;
        };
        /**
         * @description A full quote or estimate, for a Customer who has paid to read it.
         *
         *     The entitlement is checked in the view before this serializer is ever constructed. Vendor
         *     identity is present because it is exactly what the unlock or the visit plan bought; contact
         *     details are not, because they are released by the engagement and not by the fee.
         */
        CustomerProposal: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["ProposalStatusEnum"];
            readonly usability: components["schemas"]["ProposalUsabilityEnum"];
            readonly rejection_reason: components["schemas"]["RejectionReasonEnum"];
            readonly revision: number;
            /** Format: date-time */
            readonly revalidation_requested_at: string | null;
            readonly vendor: {
                [key: string]: unknown;
            };
            readonly site_visit: components["schemas"]["SiteVisit"] | null;
            readonly rate_paise_per_worker_day: number | null;
            readonly minimum_days: number | null;
            readonly worker_count: number | null;
            readonly total_paise: number;
            readonly tax_paise: number;
            readonly tax_basis: components["schemas"]["ProposalTaxBasisEnum"];
            readonly commission_treatment: string;
            readonly inclusions: unknown;
            readonly exclusions: unknown;
            readonly stages: components["schemas"]["ProposalStage"][];
            readonly material_lines: components["schemas"]["ProposalMaterialLine"][];
            readonly warranty_terms: string;
            /** Format: date-time */
            readonly valid_until: string | null;
            /** Format: date-time */
            readonly submitted_at: string;
        };
        CustomerQuoteList: {
            readonly quotes: components["schemas"]["CustomerProposal"][];
            readonly non_responsive_rejections_remaining: number | null;
            /** Format: date-time */
            readonly server_now: string;
        };
        DemandPreview: {
            readonly summaries: components["schemas"]["DemandSummary"][];
            readonly matched_service_count: number;
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description **This payload goes to a Partner who has completed no KYC.**
         *
         *     An explicit field list, like `QuoteTeaserSerializer` and for the mirrored reason. Absent by
         *     requirement, not by omission: customer name, phone, full address, building number, the exact
         *     budget, and any identifier that resolves to a requirement this Partner was not invited to.
         *
         *     `id` is a keyed hash rather than the requirement's primary key. An unapproved account holding
         *     real requirement ids is one lookup away from the record the moment any endpoint accepts one, and
         *     "no endpoint accepts one today" is not a property that survives the next endpoint.
         */
        DemandSummary: {
            readonly id: string;
            readonly headline: string;
            readonly area_label: string;
            /** Format: date */
            readonly starts_on: string | null;
            readonly workspace_key: string;
            readonly is_eligible: boolean;
            readonly eligibility_hint: string;
        };
        /**
         * @description * `NONE` - No ordering dependency
         *     * `LEFT_BEFORE_RIGHT` - Left before right
         *     * `RIGHT_BEFORE_LEFT` - Right before left
         * @enum {string}
         */
        DependencyEnum: "NONE" | "LEFT_BEFORE_RIGHT" | "RIGHT_BEFORE_LEFT";
        DispatchAttempt: {
            /** Format: uuid */
            attempt_id: string;
            rank: number;
            /** Format: uuid */
            partner_id: string;
            /** Format: date-time */
            created_at: string;
            offer_status: string | null;
            eligibility: {
                [key: string]: unknown;
            };
            ranked: components["schemas"]["RankedCandidate"][];
            excluded: components["schemas"]["ExcludedCandidate"][];
        };
        DispatchCommandRequestRequest: {
            expected_unit_version: number;
            reason: components["schemas"]["ReasonEnum"];
            /** @default  */
            note: string;
        };
        DispatchExplanation: {
            /** Format: uuid */
            fulfilment_unit_id: string;
            unit_status: string;
            unit_version: number;
            policy: string;
            policy_version: number;
            attempts: components["schemas"]["DispatchAttempt"][];
            /** Format: date-time */
            server_now: string;
        };
        DispatchReservation: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string | null;
            /** Format: uuid */
            readonly partner_id: string;
            readonly status: components["schemas"]["DispatchReservationStatusEnum"];
            /** Format: date-time */
            readonly expires_at: string;
            /** Format: date-time */
            readonly released_at: string | null;
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description * `TENTATIVE` - Tentative
         *     * `CONFIRMED` - Confirmed
         *     * `RELEASED` - Released
         * @enum {string}
         */
        DispatchReservationStatusEnum: "TENTATIVE" | "CONFIRMED" | "RELEASED";
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        DisputeCompletionRequestRequest: {
            expected_version: number;
            dispute_reason: string;
            disputed_outcome_ids?: string[];
        };
        EngageKillSwitchRequestRequest: {
            scope: components["schemas"]["KillSwitchScopeEnum"];
            /** @default  */
            target: string;
            reason: string;
        };
        /**
         * @description The agreement, frozen at reconfirmation.
         *
         *     `commercial_mode` is the field the UI must read before it promises anything. `LEAD_ONLY` means
         *     the Customer pays the vendor directly and Vsolve's protection is matching and replacement;
         *     calling that a protected booking is the promise this platform cannot keep.
         *
         *     The six money columns are the running total `M2-BE-504` reconciles: `staged_total_paise` always
         *     equals `total_paise + amendment_delta_paise`, by database constraint, so a client can show
         *     "agreed, then changed by, now" without doing arithmetic the server has not already checked.
         */
        Engagement: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly requirement: string;
            /** Format: uuid */
            readonly proposal: string;
            /** Format: uuid */
            readonly partner: string;
            readonly archetype: string;
            readonly commercial_mode: components["schemas"]["EngagementCommercialModeEnum"];
            readonly status: components["schemas"]["EngagementStatusEnum"];
            readonly total_paise: number;
            readonly tax_paise: number;
            readonly tax_basis: string;
            readonly commission_paise: number;
            readonly commission_treatment: string;
            readonly staged_total_paise: number;
            readonly amendment_delta_paise: number;
            readonly funded_total_paise: number;
            readonly approved_total_paise: number;
            readonly released_total_paise: number;
            readonly refunded_total_paise: number;
            /** Format: date-time */
            readonly contact_released_at: string | null;
            /** Format: date-time */
            readonly work_may_start_at: string | null;
            /** Format: date-time */
            readonly disputed_at: string | null;
            /** Format: date-time */
            readonly completed_at: string | null;
            readonly access_receipt: components["schemas"]["AccessReceipt"] | null;
            readonly stages: components["schemas"]["EngagementStage"][];
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description A change request, as both parties read it.
         *
         *     Flattened across `EngagementAmendment` and the M1 `ScopeAmendment` deliberately. The split is
         *     a storage fact — one amendment engine, two aggregates — and pushing it onto the wire would ask
         *     every client to know which half of the row holds the status.
         */
        EngagementAmendment: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly engagement_id: string;
            /** Format: uuid */
            readonly stage_id: string | null;
            readonly kind: string;
            readonly status: string;
            readonly reason: string;
            readonly delta_paise: number;
            readonly lines: components["schemas"]["AmendmentLine"][];
            /** Format: date-time */
            readonly expires_at: string;
            /** Format: date-time */
            readonly responded_at: string | null;
            /** Format: date-time */
            readonly applied_at: string | null;
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly server_now: string;
        };
        EngagementAmendmentCreateRequest: {
            kind: components["schemas"]["EngagementAmendmentKindEnum"];
            reason: string;
            /** Format: uuid */
            stage_id?: string | null;
            lines: components["schemas"]["AmendmentLineInputRequest"][];
        };
        /**
         * @description What an acceptance returned.
         *
         *     `checkout` is present only when the amendment needs a verified payment before it changes
         *     anything — a managed (A5) engagement taking on extra work. `null` means it is already
         *     authorized and applied: an A3 extension, or a reduction that refunded rather than charged.
         */
        EngagementAmendmentDecision: {
            readonly amendment: components["schemas"]["EngagementAmendment"];
            readonly checkout: components["schemas"]["AccessCheckout"] | null;
        };
        /**
         * @description * `TIME_EXTENSION` - Extra time on a workforce engagement
         *     * `CHANGE_ORDER` - Changed scope on a project engagement
         * @enum {string}
         */
        EngagementAmendmentKindEnum: "TIME_EXTENSION" | "CHANGE_ORDER";
        EngagementAmendmentList: {
            readonly amendments: components["schemas"]["EngagementAmendment"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description * `LEAD_ONLY` - Customer pays the vendor directly
         *     * `MANAGED_PAYMENT_REQUIRED` - Paid through Vsolve
         * @enum {string}
         */
        EngagementCommercialModeEnum: "LEAD_ONLY" | "MANAGED_PAYMENT_REQUIRED";
        /**
         * @description One line of the agreement's history.
         *
         *     `actor_is_system` rather than an actor id: who a Customer or a vendor was is not the other
         *     party's business, but *whether a person or a clock* moved something is exactly what a timeline
         *     has to say — "approved by you" and "approved because the review window closed" are different
         *     sentences.
         */
        EngagementEvent: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly stage: string | null;
            readonly from_status: string;
            readonly to_status: string;
            readonly reason_code: string;
            readonly reason: string;
            readonly actor_is_system: boolean;
            /** Format: date-time */
            readonly occurred_at: string;
        };
        EngagementEventList: {
            readonly events: components["schemas"]["EngagementEvent"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        EngagementPage: {
            readonly next: string | null;
            readonly previous: string | null;
            readonly results: components["schemas"]["Engagement"][];
        };
        /**
         * @description One shift-day or one milestone, with its money and its clocks.
         *
         *     The four money fields are published because they are what the Customer's and the vendor's
         *     screens are both asking about, and because a client that only ever sees `amount_paise` cannot
         *     tell a funded stage from an approved one from a paid one.
         *
         *     Both `*_due_at` fields are nullable and their nulls mean something specific: no review window
         *     is configured, so this stage will never auto-approve; no payout hold is configured, so its
         *     payout does not release on a clock. A screen must render nothing there rather than a countdown
         *     to a deadline nobody set.
         */
        EngagementStage: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly label: string;
            readonly amount_paise: number;
            readonly kind: components["schemas"]["EngagementStageKindEnum"];
            /** Format: date */
            readonly scheduled_on: string | null;
            readonly status: components["schemas"]["EngagementStageStatusEnum"];
            readonly funding_state: components["schemas"]["EngagementStageFundingStateEnum"];
            readonly funded_paise: number;
            readonly approved_amount_paise: number;
            readonly released_amount_paise: number;
            readonly refunded_amount_paise: number;
            readonly correction_note: string;
            readonly dispute_reason_code: string;
            /** Format: date-time */
            readonly review_due_at: string | null;
            /** Format: date-time */
            readonly payout_release_due_at: string | null;
            readonly evidence: components["schemas"]["StageEvidence"][];
            /** Format: date-time */
            readonly funded_at: string | null;
            /** Format: date-time */
            readonly started_at: string | null;
            /** Format: date-time */
            readonly evidence_submitted_at: string | null;
            /** Format: date-time */
            readonly approved_at: string | null;
            /** Format: date-time */
            readonly released_at: string | null;
            /** Format: date-time */
            readonly disputed_at: string | null;
        };
        /**
         * @description * `NOT_REQUIRED` - Not required
         *     * `REQUIRED` - Funding required
         *     * `PENDING` - Awaiting the provider
         *     * `FUNDED` - Funded
         * @enum {string}
         */
        EngagementStageFundingStateEnum: "NOT_REQUIRED" | "REQUIRED" | "PENDING" | "FUNDED";
        /**
         * @description * `WORK` - Work
         *     * `MATERIAL_ADVANCE` - Material advance
         * @enum {string}
         */
        EngagementStageKindEnum: "WORK" | "MATERIAL_ADVANCE";
        /**
         * @description * `PENDING` - Pending
         *     * `IN_PROGRESS` - In progress
         *     * `AWAITING_REVIEW` - Awaiting review
         *     * `APPROVED` - Approved
         *     * `CORRECTION_REQUESTED` - Correction requested
         *     * `DISPUTED` - Disputed
         *     * `RELEASED` - Released
         * @enum {string}
         */
        EngagementStageStatusEnum: "PENDING" | "IN_PROGRESS" | "AWAITING_REVIEW" | "APPROVED" | "CORRECTION_REQUESTED" | "DISPUTED" | "RELEASED";
        /**
         * @description * `PENDING_START` - Pending start
         *     * `ACTIVE` - Active
         *     * `COMPLETING` - Completing
         *     * `COMPLETED` - Completed
         *     * `WARRANTY` - In warranty
         *     * `CLOSED` - Closed
         *     * `DISPUTED` - Disputed
         *     * `CANCELLED` - Cancelled
         * @enum {string}
         */
        EngagementStatusEnum: "PENDING_START" | "ACTIVE" | "COMPLETING" | "COMPLETED" | "WARRANTY" | "CLOSED" | "DISPUTED" | "CANCELLED";
        EnquiryDeclineRequest: {
            reason_code: components["schemas"]["InvitationDeclineReasonEnum"];
        };
        /**
         * @description An enquiry list row.
         *
         *     Reads the **snapshot**, not the live requirement: the snapshot is what this vendor was invited
         *     against, and re-reading the requirement would silently move the goalposts under a quote in
         *     progress. Customer identity and address are absent before acceptance by design.
         */
        EnquiryDetail: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly requirement_id: string;
            readonly category_slug: string;
            readonly service_name: string;
            readonly archetype: string;
            readonly status: components["schemas"]["VendorInvitationStatusEnum"];
            readonly wave: number;
            /** Format: date-time */
            readonly requested_start: string;
            /** Format: date */
            readonly service_by: string;
            readonly language: string;
            /** Format: date-time */
            readonly responds_by: string;
            /** Format: date-time */
            readonly created_at: string;
            readonly answers: unknown;
            readonly additional_details: string;
            readonly budget_min_paise: number | null;
            readonly budget_max_paise: number | null;
            readonly required_tax_basis: string;
            readonly decline_reason_code: string;
            readonly proposals: {
                [key: string]: unknown;
            }[];
            readonly questions: components["schemas"]["RequirementQuestion"][];
            readonly site_visits: components["schemas"]["SiteVisit"][];
            readonly server_now: string;
        };
        /**
         * @description An enquiry list row.
         *
         *     Reads the **snapshot**, not the live requirement: the snapshot is what this vendor was invited
         *     against, and re-reading the requirement would silently move the goalposts under a quote in
         *     progress. Customer identity and address are absent before acceptance by design.
         */
        EnquirySummary: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly requirement_id: string;
            readonly category_slug: string;
            readonly service_name: string;
            readonly archetype: string;
            readonly status: components["schemas"]["VendorInvitationStatusEnum"];
            readonly wave: number;
            /** Format: date-time */
            readonly requested_start: string;
            /** Format: date */
            readonly service_by: string;
            readonly language: string;
            /** Format: date-time */
            readonly responds_by: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description The Partner enquiry inbox's page envelope.
         *
         *     The same correction as `RequirementSummaryPageSerializer`, and it closes a second gap Session B
         *     logged: no `cursor` parameter was published, so a Partner with more than twenty enquiries saw a
         *     silently truncated inbox with no way to page past it.
         */
        EnquirySummaryPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["EnquirySummary"][];
        };
        EscalateCaseRequestRequest: {
            expected_version: number;
            severity: components["schemas"]["OperationsCaseSeverityEnum"];
        };
        /**
         * @description The client's claim about what it uploaded; Django streams the object and checks it.
         *
         *     `sha256` is not trusted — it is *compared*. The same three-step shape FE-07 established for
         *     KYC: the client computes the digest locally, Django recomputes it from the bytes actually in
         *     the bucket, and a mismatch fails closed. Sending it is what makes the comparison possible.
         */
        EvidenceFinalizeRequestRequest: {
            kind: components["schemas"]["WorkEvidenceKindEnum"];
            object_key: string;
            content_type: string;
            size_bytes: number;
            sha256: string;
            /** Format: uuid */
            work_task_id?: string | null;
        };
        /**
         * @description A short-lived, single-attempt grant to put bytes in a private bucket.
         *
         *     The token is published because the browser must send it, and for no longer than one attempt:
         *     FE-07 established that a signed grant lives in component state and is dropped afterwards,
         *     never persisted. `expires_at` is what makes that enforceable.
         */
        EvidenceUploadGrant: {
            object_key: string;
            upload_url: string;
            upload_token: string;
            resumable_url: string;
            method: string;
            /** Format: date-time */
            expires_at: string;
        };
        EvidenceUploadRequestRequest: {
            kind: components["schemas"]["WorkEvidenceKindEnum"];
            content_type: string;
            size_bytes: number;
        };
        ExcludedCandidate: {
            /** Format: uuid */
            partner_id: string;
            reasons: string[];
        };
        ExpectedVersionRequest: {
            expected_version: number;
        };
        FulfilmentPlan: {
            /** Format: uuid */
            readonly id: string;
            readonly rank: number;
            readonly structure: components["schemas"]["StructureEnum"];
            readonly confirmation_policy: components["schemas"]["ConfirmationPolicyEnum"];
            readonly is_recommended: boolean;
            readonly professional_count: number;
            readonly visit_count: number;
            readonly decisive_reasons: unknown;
            readonly units: components["schemas"]["PlanUnit"][];
            readonly subtotal: components["schemas"]["Money"];
            readonly platform_fee: components["schemas"]["Money"];
            readonly tax: components["schemas"]["Money"];
            readonly total: components["schemas"]["Money"];
        };
        FulfilmentPlanSet: {
            /** Format: uuid */
            readonly id: string;
            readonly cart_version: number;
            readonly status: components["schemas"]["FulfilmentPlanSetStatusEnum"];
            /** Format: date-time */
            readonly server_now: string;
            /** Format: date-time */
            readonly expires_at: string;
            readonly plans: components["schemas"]["FulfilmentPlan"][];
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description Plan a cart against one start time **per visit**.
         *
         *     `preferred_starts` replaced a single `preferred_start` in 1.18.0. One time for
         *     the whole cart made "electrician on Monday, salon on Friday" inexpressible:
         *     every unit was derived by cascading a single clock forward.
         *
         *     Every group the server publishes must carry a start, and no group may carry
         *     two. A missing one is refused rather than defaulted, because defaulting picks
         *     a time on the Customer's behalf for work they never scheduled.
         */
        FulfilmentPlanSetCreateRequest: {
            /** Format: uuid */
            address_id: string;
            expected_cart_version: number;
            preferred_starts: components["schemas"]["PreferredStartRequest"][];
        };
        /**
         * @description * `ACTIVE` - Active
         *     * `INVALIDATED` - Invalidated
         *     * `EXPIRED` - Expired
         *     * `SELECTED` - Selected
         * @enum {string}
         */
        FulfilmentPlanSetStatusEnum: "ACTIVE" | "INVALIDATED" | "EXPIRED" | "SELECTED";
        FulfilmentUnit: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly status: components["schemas"]["FulfilmentUnitStatusEnum"];
            readonly version: number;
            /** Format: date-time */
            readonly starts_at: string;
            readonly arrival_window_minutes: number;
            readonly estimated_duration_minutes: number;
            /** Format: date-time */
            readonly state_deadline: string | null;
            /** Format: uuid */
            readonly booking_id: string | null;
            readonly booking_status: (components["schemas"]["BookingStatusEnum"] | components["schemas"]["NullEnum"]) | null;
            readonly professional: components["schemas"]["AssignedProfessional"] | null;
            readonly lines: components["schemas"]["FulfilmentUnitLine"][];
            readonly total: components["schemas"]["Money"];
        };
        FulfilmentUnitDispatch: {
            /** Format: uuid */
            id: string;
            position: number;
            status: string;
            version: number;
            group_status: string;
            /** Format: uuid */
            live_offer_id: string | null;
            live_offer_status: string | null;
            reservation_status: string | null;
            /** Format: date-time */
            server_now: string;
        };
        FulfilmentUnitLine: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly kind: components["schemas"]["QuoteLineKindEnum"];
            readonly code: string;
            readonly label: string;
            readonly quantity: number;
            readonly amount: components["schemas"]["Money"];
        };
        /**
         * @description * `PLANNED` - Planned
         *     * `MATCHING` - Matching
         *     * `HELD` - Held
         *     * `PAYMENT_PENDING` - Payment pending
         *     * `BOOKED` - Booked
         *     * `RECOVERY_REQUIRED` - Recovery required
         *     * `CANCELLED` - Cancelled
         *     * `FAILED` - Failed
         *     * `COMPLETED` - Completed
         *     * `PARTIALLY_COMPLETED` - Partially completed
         *     * `DISPUTED` - Disputed
         * @enum {string}
         */
        FulfilmentUnitStatusEnum: "PLANNED" | "MATCHING" | "HELD" | "PAYMENT_PENDING" | "BOOKED" | "RECOVERY_REQUIRED" | "CANCELLED" | "FAILED" | "COMPLETED" | "PARTIALLY_COMPLETED" | "DISPUTED";
        /**
         * @description * `SUBMIT_APPLICATION` - Submit the Partner application
         *     * `ADD_PAYOUT_ACCOUNT` - Add a payout account
         *     * `ADD_CREW_MEMBER` - Add a crew member
         * @enum {string}
         */
        GateNextActionEnum: "SUBMIT_APPLICATION" | "ADD_PAYOUT_ACCOUNT" | "ADD_CREW_MEMBER";
        GroupAddressChangeRequestRequest: {
            expected_version: number;
            /** Format: uuid */
            new_address_id: string;
        };
        GroupCancelRequestRequest: {
            expected_version: number;
            reason: string;
        };
        GroupCancellationResult: {
            /** Format: uuid */
            booking_group_id: string;
            group_status: string;
            group_version: number;
            units: components["schemas"]["UnitCancellationOutcome"][];
            /** Format: date-time */
            server_now: string;
        };
        GroupQuote: {
            /** Format: uuid */
            readonly id: string;
            readonly version: number;
            readonly status: components["schemas"]["GroupQuoteStatusEnum"];
            readonly cart_version: number;
            /** Format: uuid */
            readonly plan_set_id: string;
            /** Format: uuid */
            readonly plan_id: string;
            readonly structure: string;
            readonly confirmation_policy: string;
            /** Format: date-time */
            readonly server_now: string;
            /** Format: date-time */
            readonly expires_at: string;
            readonly units: components["schemas"]["GroupQuoteUnit"][];
            readonly total: components["schemas"]["Money"];
            /** Format: date-time */
            readonly created_at: string;
        };
        GroupQuoteLine: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly kind: components["schemas"]["QuoteLineKindEnum"];
            readonly code: string;
            readonly label: string;
            readonly quantity: number;
            /** Format: uuid */
            readonly cart_item_id: string;
            readonly amount: components["schemas"]["Money"];
        };
        /**
         * @description * `ACTIVE` - Active
         *     * `INVALIDATED` - Invalidated
         *     * `EXPIRED` - Expired
         *     * `CONSUMED` - Consumed
         * @enum {string}
         */
        GroupQuoteStatusEnum: "ACTIVE" | "INVALIDATED" | "EXPIRED" | "CONSUMED";
        GroupQuoteUnit: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            /** Format: date-time */
            readonly starts_at: string;
            /** Format: date-time */
            readonly ends_at: string;
            readonly arrival_window_minutes: number;
            readonly estimated_duration_minutes: number;
            readonly lines: components["schemas"]["GroupQuoteLine"][];
            readonly total: components["schemas"]["Money"];
            readonly cancellation_policy_snapshot: unknown;
        };
        GroupRescheduleRequestRequest: {
            expected_version: number;
            /** Format: date-time */
            new_group_start: string;
        };
        GroupRescheduleResult: {
            /** Format: uuid */
            booking_group_id: string;
            group_version: number;
            shift_seconds: number;
            units: components["schemas"]["UnitRescheduleOutcome"][];
            /** Format: date-time */
            server_now: string;
        };
        /**
         * @description * `partner` - partner
         * @enum {string}
         */
        IntendedRoleEnum: "partner";
        /**
         * @description * `TOO_FAR` - Too far to travel
         *     * `NO_CAPACITY` - No capacity on those dates
         *     * `OUT_OF_SCOPE` - Not work we do
         *     * `BUDGET_TOO_LOW` - Budget is below what this costs
         *     * `UNCLEAR_SCOPE` - Cannot tell what is being asked for
         *     * `OTHER` - Another reason
         * @enum {string}
         */
        InvitationDeclineReasonEnum: "TOO_FAR" | "NO_CAPACITY" | "OUT_OF_SCOPE" | "BUDGET_TOO_LOW" | "UNCLEAR_SCOPE" | "OTHER";
        /**
         * @description A switch, with both signatures and both timestamps.
         *
         *     Who engaged it and why are published rather than kept internal: the question asked during an
         *     incident is "why did notifications stop at 3am", and an answer that requires a database query
         *     is an answer nobody gets in time.
         */
        KillSwitch: {
            /** Format: uuid */
            readonly id: string;
            readonly scope: components["schemas"]["KillSwitchScopeEnum"];
            readonly target: string;
            readonly is_engaged: boolean;
            readonly reason: string;
            /** Format: uuid */
            readonly engaged_by_id: string | null;
            /** Format: date-time */
            readonly engaged_at: string | null;
            /** Format: uuid */
            readonly released_by_id: string | null;
            /** Format: date-time */
            readonly released_at: string | null;
            readonly version: number;
            /** Format: date-time */
            readonly updated_at: string;
        };
        /**
         * @description * `NOTIFICATIONS` - All outbound notifications
         *     * `SMS` - SMS channel
         *     * `WHATSAPP` - WhatsApp channel
         *     * `VOICE` - Voice call channel
         *     * `PAYMENTS` - Payment collection
         *     * `PAYOUTS` - Partner payouts
         *     * `DISPATCH` - Partner dispatch
         *     * `SERVICE_AREA` - One service area
         *     * `SERVICE` - One service
         * @enum {string}
         */
        KillSwitchScopeEnum: "NOTIFICATIONS" | "SMS" | "WHATSAPP" | "VOICE" | "PAYMENTS" | "PAYOUTS" | "DISPATCH" | "SERVICE_AREA" | "SERVICE";
        /**
         * @description A correction, which is always a new entry rather than an edit.
         *
         *     `net_paise` is signed and deliberately has no minimum: a negative value is a reversal, which
         *     is the whole mechanism the settlement document asks for.
         */
        LedgerAdjustmentRequestRequest: {
            /** Format: uuid */
            partner_id: string;
            net_paise: number;
            reason: string;
            /** Format: uuid */
            corrects_id?: string | null;
        };
        /**
         * @description * `EARNING` - Earning
         *     * `ADJUSTMENT` - Adjustment
         *     * `REVERSAL` - Reversal
         * @enum {string}
         */
        LedgerEntryKindEnum: "EARNING" | "ADJUSTMENT" | "REVERSAL";
        /**
         * @description * `PENDING` - Pending
         *     * `AVAILABLE` - Available
         *     * `RESERVED` - Reserved in a batch
         *     * `PAID` - Paid
         *     * `RELEASED` - Released
         * @enum {string}
         */
        LedgerEntryStatusEnum: "PENDING" | "AVAILABLE" | "RESERVED" | "PAID" | "RELEASED";
        /**
         * @description * `DRAFT` - Draft
         *     * `ACTIVE` - Active
         *     * `RETIRED` - Retired
         *     * `REJECTED` - Rejected
         * @enum {string}
         */
        LifecycleStatusEnum: "DRAFT" | "ACTIVE" | "RETIRED" | "REJECTED";
        ManualOfferRequest: {
            /** Format: uuid */
            partner_id: string;
        };
        /**
         * @description * `SAME_PARTNER_SEQUENTIAL` - Same Partner sequential
         *     * `PARALLEL_ALLOWED` - Parallel allowed
         *     * `MUST_BE_SEPARATE` - Must be separate
         * @enum {string}
         */
        ModeEnum: "SAME_PARTNER_SEQUENTIAL" | "PARALLEL_ALLOWED" | "MUST_BE_SEPARATE";
        Money: {
            readonly amount_paise: number;
            readonly currency: string;
        };
        /** @enum {unknown} */
        NullEnum: null;
        Offer: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly checkout_id: string | null;
            /** Format: uuid */
            readonly fulfilment_unit_id: string | null;
            readonly unit_position: number | null;
            /** Format: date-time */
            readonly starts_at: string | null;
            readonly estimated_duration_minutes: number | null;
            readonly approximate_area: string | null;
            readonly service_lines: components["schemas"]["OfferServiceLine"][];
            readonly requirements: string[];
            readonly estimated_gross: components["schemas"]["Money"] | null;
            readonly commission: components["schemas"]["Money"] | null;
            readonly estimated_net: components["schemas"]["Money"] | null;
            readonly status: components["schemas"]["OfferStatusEnum"];
            /** Format: date-time */
            readonly expires_at: string;
            /** Format: date-time */
            readonly undo_deadline: string | null;
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly server_now: string;
        };
        /** @enum {string} */
        OfferActionEnum: "accept" | "commit" | "decline" | "undo";
        OfferPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["Offer"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        OfferServiceLine: {
            /** Format: uuid */
            line_id: string;
            service_label: string;
            quantity: number;
            scope: {
                [key: string]: unknown;
            };
        };
        /**
         * @description * `OFFERED` - Offered
         *     * `ACCEPTED_PENDING_UNDO` - Accepted pending undo
         *     * `COMMITTED` - Committed
         *     * `UNDONE` - Undone
         *     * `DECLINED` - Declined
         *     * `EXPIRED` - Expired
         *     * `REVOKED` - Revoked
         * @enum {string}
         */
        OfferStatusEnum: "OFFERED" | "ACCEPTED_PENDING_UNDO" | "COMMITTED" | "UNDONE" | "DECLINED" | "EXPIRED" | "REVOKED";
        OpenCaseRequestRequest: {
            kind: components["schemas"]["OperationsCaseKindEnum"];
            summary: string;
            /** @default NORMAL */
            severity: components["schemas"]["OperationsCaseSeverityEnum"];
            /** @default  */
            detail: string;
            /** Format: uuid */
            booking_id?: string | null;
            /** Format: uuid */
            order_id?: string | null;
            /** Format: uuid */
            partner_id?: string | null;
        };
        OperationsApplicationQueueItem: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["PartnerApplicationStatusEnum"];
            readonly version: number;
            readonly display_name: string;
            /** Format: date-time */
            readonly submitted_at: string | null;
            /** Format: uuid */
            readonly review_assigned_to_id: string | null;
            /** Format: date-time */
            readonly review_assigned_at: string | null;
            /** Format: date-time */
            readonly updated_at: string;
        };
        OperationsApplicationQueuePage: {
            /** Format: uri */
            readonly next: string | null;
            /** Format: uri */
            readonly previous: string | null;
            readonly results: components["schemas"]["OperationsApplicationQueueItem"][];
        };
        /**
         * @description Cross-unit recovery context, with the audit trail that justifies it.
         *
         *     Operations is the one actor that legitimately sees both sides, so this is the one
         *     projection that names the Partner and the Booking Group. Every read of it is audited by
         *     `IsOperationsUser`.
         */
        OperationsBooking: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string | null;
            /** Format: uuid */
            readonly booking_group_id: string | null;
            /** Format: uuid */
            readonly order_id: string;
            readonly status: components["schemas"]["BookingStatusEnum"];
            readonly version: number;
            /** Format: date-time */
            readonly scheduled_start: string;
            readonly estimated_duration_minutes: number;
            /** Format: uuid */
            readonly partner_id: string;
            readonly partner_display_name: string;
            /** Format: date-time */
            readonly en_route_at: string | null;
            /** Format: date-time */
            readonly arrived_at: string | null;
            /** Format: date-time */
            readonly customer_unavailable_wait_started_at: string | null;
            /** Format: date-time */
            readonly late_declared_at: string | null;
            /** Format: date-time */
            readonly cancelled_at: string | null;
            readonly cancellation_reason: string;
            readonly payout_hold: boolean;
            readonly work_tasks: components["schemas"]["WorkTask"][];
            readonly evidence: components["schemas"]["WorkEvidence"][];
            readonly status_history: components["schemas"]["BookingStatusHistory"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description One case, with the vocabulary a reviewer needs to close it.
         *
         *     `allowed_resolutions` is published rather than hardcoded in the console. The set is a domain
         *     rule that differs per case kind, and a UI carrying its own copy would offer a button the
         *     server refuses the first time the two drift — the same reason `recovery_action` is published
         *     on Booking Groups instead of being inferred from status.
         */
        OperationsCase: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["OperationsCaseKindEnum"];
            readonly severity: components["schemas"]["OperationsCaseSeverityEnum"];
            readonly status: components["schemas"]["OperationsCaseStatusEnum"];
            readonly owner_team: components["schemas"]["OperationsCaseTeamEnum"];
            /** Format: uuid */
            readonly owner_id: string | null;
            /** Format: uuid */
            readonly booking_id: string | null;
            /** Format: uuid */
            readonly order_id: string | null;
            /** Format: uuid */
            readonly partner_id: string | null;
            readonly summary: string;
            readonly detail: string;
            /** Format: date-time */
            readonly due_at: string;
            readonly is_overdue: boolean;
            readonly version: number;
            readonly resolution: string;
            readonly resolution_note: string;
            /** Format: date-time */
            readonly resolved_at: string | null;
            readonly holds_payout: boolean;
            readonly allowed_resolutions: string[];
            readonly events: components["schemas"]["OperationsCaseEvent"][];
            /** Format: date-time */
            readonly server_now: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        OperationsCaseEvent: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["OperationsCaseEventKindEnum"];
            /** Format: uuid */
            readonly actor_id: string | null;
            readonly body: string;
            readonly context: unknown;
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description * `OPENED` - Opened
         *     * `CLAIMED` - Claimed
         *     * `STATUS_CHANGED` - Status changed
         *     * `SEVERITY_CHANGED` - Severity changed
         *     * `NOTE` - Note
         *     * `COMMUNICATION` - Communication sent
         *     * `RESOLVED` - Resolved
         *     * `CANCELLED` - Cancelled
         * @enum {string}
         */
        OperationsCaseEventKindEnum: "OPENED" | "CLAIMED" | "STATUS_CHANGED" | "SEVERITY_CHANGED" | "NOTE" | "COMMUNICATION" | "RESOLVED" | "CANCELLED";
        /**
         * @description * `ASSIGNMENT` - Assignment or recovery
         *     * `LATE_NO_SHOW` - Late or no-show
         *     * `CUSTOMER_UNAVAILABLE` - Customer unavailable
         *     * `PARTIAL_WORK` - Partial or aborted work
         *     * `QUALITY` - Quality or warranty
         *     * `SAFETY` - Safety or damage
         *     * `PAYMENT` - Payment ambiguity
         *     * `REFUND` - Refund ambiguity
         *     * `PAYOUT` - Payout ambiguity
         * @enum {string}
         */
        OperationsCaseKindEnum: "ASSIGNMENT" | "LATE_NO_SHOW" | "CUSTOMER_UNAVAILABLE" | "PARTIAL_WORK" | "QUALITY" | "SAFETY" | "PAYMENT" | "REFUND" | "PAYOUT";
        /**
         * @description The queue row. No events and no detail — a list of two hundred cases should not carry
         *     two hundred audit trails, and the body of a safety report is not queue-scanning material.
         */
        OperationsCaseList: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["OperationsCaseKindEnum"];
            readonly severity: components["schemas"]["OperationsCaseSeverityEnum"];
            readonly status: components["schemas"]["OperationsCaseStatusEnum"];
            readonly owner_team: components["schemas"]["OperationsCaseTeamEnum"];
            /** Format: uuid */
            readonly owner_id: string | null;
            /** Format: uuid */
            readonly booking_id: string | null;
            /** Format: uuid */
            readonly partner_id: string | null;
            readonly summary: string;
            /** Format: date-time */
            readonly due_at: string;
            readonly is_overdue: boolean;
            readonly version: number;
            readonly holds_payout: boolean;
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description The paginated envelope the queue actually returns.
         *
         *     Declared explicitly because `responses={200: Serializer(many=True)}` publishes a bare array,
         *     and the view returns `{next, previous, results}`. A generated client built from the array
         *     shape reads `page.next` off an array and gets `undefined` — a contract that lies about its
         *     own response, which is worse than one that omits it.
         */
        OperationsCasePage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["OperationsCaseList"][];
        };
        /**
         * @description * `LOW` - Low
         *     * `NORMAL` - Normal
         *     * `HIGH` - High
         *     * `URGENT` - Urgent
         * @enum {string}
         */
        OperationsCaseSeverityEnum: "LOW" | "NORMAL" | "HIGH" | "URGENT";
        /**
         * @description * `OPEN` - Open
         *     * `IN_PROGRESS` - In progress
         *     * `WAITING` - Waiting on someone
         *     * `RESOLVED` - Resolved
         *     * `CANCELLED` - Cancelled
         * @enum {string}
         */
        OperationsCaseStatusEnum: "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CANCELLED";
        /**
         * @description * `DISPATCH` - Dispatch Operations
         *     * `BOOKING_SUPPORT` - Booking support
         *     * `QUALITY_SUPPORT` - Quality support
         *     * `SAFETY` - Restricted safety team
         *     * `FINANCE` - Finance Operations
         * @enum {string}
         */
        OperationsCaseTeamEnum: "DISPATCH" | "BOOKING_SUPPORT" | "QUALITY_SUPPORT" | "SAFETY" | "FINANCE";
        /**
         * @description * `APPROVED` - APPROVED
         *     * `REJECTED` - REJECTED
         * @enum {string}
         */
        OperationsDocumentReviewDecisionEnum: "APPROVED" | "REJECTED";
        OperationsDocumentReviewRequest: {
            decision: components["schemas"]["OperationsDocumentReviewDecisionEnum"];
            reason?: string;
        };
        /** @description One Partner, for the management screen. */
        OperationsPartnerDetail: {
            /** Format: uuid */
            readonly id: string;
            readonly display_name: string;
            readonly biography: string;
            readonly experience_years: number;
            /** Format: uuid */
            readonly application_id: string;
            readonly application_status: string;
            readonly application_version: number;
            readonly change_request_message: string;
            /** Format: date-time */
            readonly submitted_at: string;
            /** Format: date-time */
            readonly reviewed_at: string;
            readonly skills: components["schemas"]["PartnerSkillChip"][];
            readonly services: components["schemas"]["PartnerSkillChip"][];
            readonly service_areas: components["schemas"]["PartnerSkillChip"][];
            readonly documents: components["schemas"]["OperationsPartnerDocumentState"][];
            readonly transitions: components["schemas"]["PartnerApplicationTransition"][];
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description One directory row.
         *
         *     Carries the application's *status* but none of its contents. Deciding on an application is
         *     the review surface's job, behind its own audit; this row exists so somebody can find a
         *     Partner.
         */
        OperationsPartnerDirectoryItem: {
            /** Format: uuid */
            readonly id: string;
            readonly display_name: string;
            readonly experience_years: number;
            /** Format: uuid */
            readonly application_id: string;
            readonly application_status: string;
            /** Format: date-time */
            readonly submitted_at: string;
            /** Format: date-time */
            readonly reviewed_at: string;
            readonly skills: components["schemas"]["PartnerSkillChip"][];
            readonly service_count: number;
            readonly service_area_count: number;
            /** Format: date-time */
            readonly created_at: string;
        };
        OperationsPartnerDirectoryPage: {
            /** Format: uri */
            readonly next: string | null;
            /** Format: uri */
            readonly previous: string | null;
            readonly results: components["schemas"]["OperationsPartnerDirectoryItem"][];
        };
        /**
         * @description A document's existence and verdict — never its contents.
         *
         *     No URL and no storage key, by design. Revealing a document goes through
         *     `OperationsPartnerDocumentAccessView`, which mints a short-lived link and records who
         *     looked; publishing one here would route around that audit.
         */
        OperationsPartnerDocumentState: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["PartnerDocumentKindEnum"];
            readonly status: components["schemas"]["PartnerDocumentStatusEnum"];
            /** Format: date-time */
            readonly reviewed_at: string | null;
            /** Format: date-time */
            readonly uploaded_at: string;
        };
        OperationsPartnerScheduleUpdateRequest: {
            rules: components["schemas"]["PartnerAvailabilityRuleInputRequest"][];
            exceptions: components["schemas"]["PartnerAvailabilityExceptionInputRequest"][];
            consent_purpose: string;
            consent_document_version: string;
        };
        OperationsTransitionRequest: {
            expected_version: number;
            target_status: components["schemas"]["TargetStatusEnum"];
            reason?: string;
        };
        Order: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly checkout_id: string;
            /** Format: uuid */
            readonly booking_group_id: string | null;
            /** Format: uuid */
            readonly quote_id: string;
            readonly status: components["schemas"]["OrderStatusEnum"];
            readonly version: number;
            readonly total: components["schemas"]["Money"];
            readonly bookings: components["schemas"]["Booking"][];
            readonly tax_documents: components["schemas"]["TaxDocument"][];
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly updated_at: string;
        };
        /**
         * @description * `CONFIRMED` - Confirmed
         *     * `CANCELLED` - Cancelled
         *     * `REFUNDING` - Refunding
         *     * `REFUNDED` - Refunded
         * @enum {string}
         */
        OrderStatusEnum: "CONFIRMED" | "CANCELLED" | "REFUNDING" | "REFUNDED";
        OtpIssued: {
            /** Format: uuid */
            readonly challenge_id: string;
            readonly expires_in_seconds: number;
            readonly resend_after_seconds: number;
            readonly code_length: number;
            readonly development_code: string | null;
        };
        OtpRequestRequest: {
            phone_number: string;
            device_identifier?: string;
            /** @default  */
            intended_role: components["schemas"]["IntendedRoleEnum"] | components["schemas"]["BlankEnum"];
        };
        OtpVerifyRequest: {
            /** Format: uuid */
            challenge_id: string;
            phone_number: string;
            code: string;
            device_identifier?: string;
            device_label?: string;
        };
        OutcomeInputRequest: {
            /** Format: uuid */
            work_task_id: string;
            outcome: components["schemas"]["WorkOutcomeEnum"];
            /** @default 0 */
            quantity: number;
            /** @default  */
            reason: string;
        };
        PartnerApplication: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly partner_id: string;
            readonly status: components["schemas"]["PartnerApplicationStatusEnum"];
            readonly version: number;
            readonly display_name: string;
            readonly biography: string;
            readonly experience_years: number;
            readonly skill_codes: string[];
            readonly service_variant_ids: string[];
            readonly service_area_ids: string[];
            readonly change_request_message: string;
            /** Format: date-time */
            readonly submitted_at: string | null;
            /** Format: uuid */
            readonly review_assigned_to_id: string | null;
            /** Format: date-time */
            readonly review_assigned_at: string | null;
            /** Format: date-time */
            readonly reviewed_at: string | null;
            readonly consents: components["schemas"]["PartnerConsent"][];
            readonly documents: components["schemas"]["PartnerDocument"][];
            readonly transitions: components["schemas"]["PartnerApplicationTransition"][];
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly updated_at: string;
        };
        /**
         * @description * `DRAFT` - Draft
         *     * `SUBMITTED` - Submitted
         *     * `UNDER_REVIEW` - Under review
         *     * `CHANGES_REQUIRED` - Changes required
         *     * `APPROVED` - Approved
         *     * `SUSPENDED` - Suspended
         *     * `OFFBOARDED` - Offboarded
         * @enum {string}
         */
        PartnerApplicationStatusEnum: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUIRED" | "APPROVED" | "SUSPENDED" | "OFFBOARDED";
        PartnerApplicationTransition: {
            /** Format: uuid */
            readonly id: string;
            readonly from_status: string;
            readonly to_status: string;
            readonly reason_code: string;
            readonly reason: string;
            readonly application_version: number;
            /** Format: date-time */
            readonly occurred_at: string;
        };
        PartnerAvailabilityException: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly service_area_id: string;
            /** Format: date */
            readonly date: string;
            readonly is_available: boolean;
            /** Format: time */
            readonly starts_at: string | null;
            /** Format: time */
            readonly ends_at: string | null;
            readonly ends_next_day: boolean;
            readonly reason: string;
        };
        PartnerAvailabilityExceptionInputRequest: {
            /** Format: uuid */
            service_area_id: string;
            /** Format: date */
            date: string;
            is_available: boolean;
            /** Format: time */
            starts_at?: string | null;
            /** Format: time */
            ends_at?: string | null;
            /** @default false */
            ends_next_day: boolean;
            reason?: string;
        };
        PartnerAvailabilityRule: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly service_area_id: string;
            /** @description Monday is 0 and Sunday is 6. */
            readonly weekday: number;
            /** Format: time */
            readonly starts_at: string;
            /** Format: time */
            readonly ends_at: string;
            readonly ends_next_day: boolean;
            readonly is_active: boolean;
        };
        PartnerAvailabilityRuleInputRequest: {
            /** Format: uuid */
            service_area_id: string;
            weekday: number;
            /** Format: time */
            starts_at: string;
            /** Format: time */
            ends_at: string;
            /** @default false */
            ends_next_day: boolean;
        };
        /**
         * @description What is owed, by state.
         *
         *     Four numbers rather than one, because "you have ₹4,200" is not true in any useful sense when
         *     ₹1,800 of it is held behind an open quality case. A Partner planning their week needs to know
         *     which part of it is actually coming.
         */
        PartnerBalance: {
            pending_paise: number;
            available_paise: number;
            reserved_paise: number;
            paid_paise: number;
            currency: string;
            /** Format: date-time */
            server_now: string;
        };
        /**
         * @description The same visit, as the Partner assigned to it sees it.
         *
         *     Deliberately does not carry `order_id`, any sibling unit, or any money beyond the per-task
         *     amounts the Partner is working to. The Booking Group is not addressable from here at all:
         *     `G7` requires that a Partner cannot reach a sibling unit's scope or earnings, and the
         *     cheapest way to guarantee that is to never publish the identifier that would let them try.
         */
        PartnerBooking: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string | null;
            readonly status: components["schemas"]["BookingStatusEnum"];
            readonly version: number;
            /** Format: date-time */
            readonly scheduled_start: string;
            readonly estimated_duration_minutes: number;
            /** Format: date-time */
            readonly en_route_at: string | null;
            /** Format: date-time */
            readonly arrived_at: string | null;
            /** Format: date-time */
            readonly customer_unavailable_wait_started_at: string | null;
            /** Format: date-time */
            readonly late_declared_at: string | null;
            readonly work_tasks: components["schemas"]["WorkTask"][];
            readonly evidence: components["schemas"]["WorkEvidence"][];
            readonly active_amendment: components["schemas"]["ScopeAmendment"] | null;
            readonly earning: components["schemas"]["PartnerBookingEarning"] | null;
            readonly server_now: string;
        };
        /** @description One Partner's own money for one job — never the Customer's invoice. */
        PartnerBookingEarning: {
            gross_paise: number;
            commission_paise: number;
            net_paise: number;
            currency: string;
            status: string;
            calculation_snapshot: unknown;
        };
        PartnerBookingPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["PartnerBooking"][];
            /** Format: date-time */
            server_now: string;
        };
        PartnerBusinessProfile: {
            readonly business_type: components["schemas"]["PartnerBusinessTypeEnum"];
            readonly legal_name: string;
            readonly registration_number: string;
            readonly gst_registered: boolean;
            readonly gstin: string;
            readonly years_in_operation: number;
            /** Format: date-time */
            readonly updated_at: string;
        };
        /**
         * @description A full replace, not a merge.
         *
         *     `business_type` is required and is **read, never inferred** - not from the capability requested,
         *     not from the services selected. The three types carry different tax, liability and payout
         *     consequences, so the Partner states which one they are and the platform does not guess.
         */
        PartnerBusinessProfileWriteRequest: {
            business_type: components["schemas"]["PartnerBusinessTypeEnum"];
            legal_name?: string;
            registration_number?: string;
            /** @default false */
            gst_registered: boolean;
            gstin?: string;
            years_in_operation?: number;
        };
        /**
         * @description * `INDIVIDUAL` - Individual
         *     * `WORKFORCE_AGENCY` - Workforce agency
         *     * `PROJECT_VENDOR` - Project vendor
         * @enum {string}
         */
        PartnerBusinessTypeEnum: "INDIVIDUAL" | "WORKFORCE_AGENCY" | "PROJECT_VENDOR";
        /**
         * @description One capability in any status. The read that distinguishes the navigation states.
         *
         *     `/partner/workspaces/` answers *what may I do* and stays empty and cheap for the great majority
         *     of Partners who hold no capability at all. This answers *where does my application stand*, which
         *     is why the two are separate reads: an empty grant list cannot tell "not applied" from "under
         *     review" from "suspended", and inferring a review banner from it would show one to every existing
         *     M1 Partner.
         */
        PartnerCapability: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly variant_id: string;
            readonly variant_name: string;
            readonly workspace_key: string;
            readonly commercial_mode: string;
            readonly status: string;
            readonly review_notes: string;
            readonly suspension_reason_code: string;
            readonly requires_insurance: boolean;
            readonly max_crew_size: number | null;
            readonly max_project_value_paise: number | null;
            readonly service_area_ids: string[];
            readonly registration_answers: unknown;
            /** Format: date-time */
            readonly expires_at: string | null;
            readonly expired_document_kinds: string[];
            /** Format: date */
            readonly documents_expiring_on: string | null;
            readonly last_transition: components["schemas"]["CapabilityTransitionSummary"] | null;
            /** Format: date-time */
            readonly reviewed_at: string | null;
            /** Format: date-time */
            readonly updated_at: string;
        };
        PartnerCapabilityList: {
            readonly capabilities: components["schemas"]["PartnerCapability"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        PartnerConsent: {
            /** Format: uuid */
            readonly id: string;
            readonly purpose: string;
            readonly document_version: string;
            /** Format: date-time */
            readonly accepted_at: string;
            /** Format: date-time */
            readonly withdrawn_at: string | null;
        };
        PartnerConsentDocument: {
            readonly purpose: string;
            readonly title: string;
            readonly document_version: string;
            /** Format: uri */
            readonly document_url: string;
            readonly is_required_for_submission: boolean;
            /** Format: date-time */
            readonly published_at: string;
        };
        PartnerConsentInputRequest: {
            purpose: string;
            document_version: string;
        };
        PartnerDailyPerformance: {
            /** Format: date */
            date: string;
            net_paise: number;
            jobs: number;
        };
        PartnerDocument: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["PartnerDocumentKindEnum"];
            readonly version: number;
            readonly content_type: string;
            readonly size_bytes: number;
            readonly sha256: string;
            readonly scan_status: components["schemas"]["ScanStatusEnum"];
            /** Format: date-time */
            readonly scanned_at: string | null;
            readonly status: components["schemas"]["PartnerDocumentStatusEnum"];
            readonly review_reason: string;
            /** Format: date-time */
            readonly uploaded_at: string;
            /** Format: date-time */
            readonly reviewed_at: string | null;
        };
        PartnerDocumentFinalizeRequest: {
            expected_version: number;
            /** Format: uuid */
            upload_id: string;
        };
        /**
         * @description * `GOVERNMENT_ID` - Government identity
         *     * `ADDRESS_PROOF` - Address proof
         *     * `TAX` - Tax document
         *     * `BANK` - Bank document
         *     * `BACKGROUND_CHECK` - Background check
         *     * `OTHER` - Other
         * @enum {string}
         */
        PartnerDocumentKindEnum: "GOVERNMENT_ID" | "ADDRESS_PROOF" | "TAX" | "BANK" | "BACKGROUND_CHECK" | "OTHER";
        PartnerDocumentReviewAccess: {
            /** Format: uri */
            readonly review_url: string;
            /** Format: date-time */
            readonly expires_at: string;
        };
        /**
         * @description * `PENDING` - Pending review
         *     * `APPROVED` - Approved
         *     * `REJECTED` - Rejected
         *     * `SUPERSEDED` - Superseded
         * @enum {string}
         */
        PartnerDocumentStatusEnum: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
        PartnerDocumentUpload: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["PartnerDocumentKindEnum"];
            readonly object_key: string;
            readonly content_type: string;
            readonly size_bytes: number;
            readonly sha256: string;
            /** Format: uri */
            readonly upload_url: string;
            readonly upload_token: string;
            /** Format: uri */
            readonly resumable_url: string;
            /** Format: date-time */
            readonly expires_at: string;
        };
        PartnerDocumentUploadRequestRequest: {
            expected_version: number;
            kind: components["schemas"]["PartnerDocumentKindEnum"];
            content_type: components["schemas"]["ContentTypeEnum"];
            size_bytes: number;
            sha256: string;
        };
        PartnerGoOnlineRequest: {
            /** Format: uuid */
            service_area_id: string;
            /** Format: decimal */
            latitude: string;
            /** Format: decimal */
            longitude: string;
            accuracy_m: number;
            consent_version: string;
        };
        PartnerInsurance: {
            readonly insurer_name: string;
            readonly policy_reference: string;
            readonly coverage_paise: number;
            readonly covers_workmen_compensation: boolean;
            /** Format: date */
            readonly valid_from: string;
            /** Format: date */
            readonly valid_to: string;
            /** Format: date-time */
            readonly verified_at: string | null;
        };
        PartnerInsuranceWriteRequest: {
            insurer_name: string;
            policy_reference: string;
            coverage_paise: number;
            /** @default false */
            covers_workmen_compensation: boolean;
            /** Format: date */
            valid_from: string;
            /** Format: date */
            valid_to: string;
        };
        PartnerLanguageList: {
            readonly language_tags: string[];
        };
        PartnerLanguageWriteRequest: {
            language_tags: string[];
        };
        /**
         * @description One line of a Partner's statement.
         *
         *     `calculation_snapshot` is published deliberately: a Partner is entitled to see why they were
         *     paid what they were paid, and "the commission was 18% capped at ₹X, applied to the two tasks
         *     you actually completed" is the answer. Hiding it turns every payment question into a support
         *     ticket.
         */
        PartnerLedgerEntry: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly booking_id: string | null;
            readonly kind: components["schemas"]["LedgerEntryKindEnum"];
            readonly status: components["schemas"]["LedgerEntryStatusEnum"];
            readonly gross_paise: number;
            readonly commission_paise: number;
            readonly net_paise: number;
            readonly currency: string;
            readonly calculation_snapshot: unknown;
            /** Format: uuid */
            readonly corrects_id: string | null;
            readonly reason: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        PartnerLedgerPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["PartnerLedgerEntry"][];
        };
        /**
         * @description The account, masked, plus when it becomes usable.
         *
         *     `effective_from` is published because it is the honest explanation for why a freshly added
         *     account has not been paid into yet. Without it the Partner sees a verified account and no
         *     money, which reads as a bug rather than as the cooling period it is.
         */
        PartnerPayoutAccount: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["PayoutAccountStatusEnum"];
            readonly account_last4: string;
            readonly ifsc: string;
            readonly holder_name: string;
            /** Format: date-time */
            readonly verified_at: string | null;
            /** Format: date-time */
            readonly effective_from: string;
            readonly is_payable_now: boolean;
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description How a Partner is doing, in the periods they think in.
         *
         *     Counts come from `EARNING` ledger entries — one per completed booking, written
         *     at settlement — so "jobs done" is never inferred from a mutable booking
         *     timestamp. Revenue sums every entry kind, so an adjustment or reversal shows
         *     up the day it lands rather than drifting from the balance beside it.
         */
        PartnerPerformance: {
            today_net_paise: number;
            today_jobs: number;
            month_net_paise: number;
            month_jobs: number;
            average_monthly_net_paise: number;
            lifetime_net_paise: number;
            lifetime_jobs: number;
            daily: components["schemas"]["PartnerDailyPerformance"][];
            currency: string;
            /** Format: date-time */
            server_now: string;
        };
        PartnerPresence: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly service_area_id: string;
            /** Format: date-time */
            readonly started_at: string;
            /** Format: date-time */
            readonly last_persisted_heartbeat_at: string;
            /** Format: date-time */
            readonly server_now: string;
        };
        PartnerPresenceHeartbeatRequest: {
            /** Format: uuid */
            session_id: string;
            /** Format: decimal */
            latitude?: string;
            /** Format: decimal */
            longitude?: string;
            accuracy_m?: number;
            consent_version?: string;
        };
        PartnerPresenceSessionRequestRequest: {
            /** Format: uuid */
            session_id: string;
        };
        /**
         * @description Who the Partner is, as distinct from the form they filled in to join.
         *
         *     `GET /partner/me/` used to return the application, which is why the app had no
         *     profile screen worth the name: opening "Profile" showed a half-finished
         *     onboarding draft. An application is a *submission* with a review lifecycle; a
         *     profile is a standing record of a person who works here. Those stop being the
         *     same thing the moment onboarding is approved.
         *
         *     Carries what a Partner would expect to see about themselves and nothing about
         *     anyone else: no reviewer, no internal review notes, no other Partner's areas.
         *     `approval_status` is published because it decides whether they can work at
         *     all, and a Partner is entitled to know that without reading it off a rejected
         *     request.
         */
        PartnerProfile: {
            /** Format: uuid */
            readonly id: string;
            readonly display_name: string;
            readonly phone_number: string;
            readonly biography: string;
            readonly experience_years: number;
            readonly approval_status: string | null;
            readonly skills: string[];
            readonly service_areas: string[];
            /** Format: date-time */
            readonly member_since: string;
            readonly has_payout_account: boolean;
        };
        PartnerSchedule: {
            readonly rules: components["schemas"]["PartnerAvailabilityRule"][];
            readonly exceptions: components["schemas"]["PartnerAvailabilityException"][];
        };
        PartnerScheduleUpdateRequest: {
            rules: components["schemas"]["PartnerAvailabilityRuleInputRequest"][];
            exceptions: components["schemas"]["PartnerAvailabilityExceptionInputRequest"][];
        };
        PartnerServiceAreaOption: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly timezone: string;
            readonly is_accepting_partners: boolean;
        };
        /** @description A code/name pair, for the chips the directory renders. */
        PartnerSkillChip: {
            readonly code: string;
            readonly name: string;
        };
        PartnerSkillOption: {
            readonly code: string;
            readonly name: string;
            readonly description: string;
        };
        PatchedAddressRequest: {
            label?: string;
            line1?: string;
            line2?: string;
            landmark?: string;
            locality?: string;
            city?: string;
            state?: string;
            postal_code?: string;
            country_code?: string;
            /** Format: decimal */
            latitude?: string;
            /** Format: decimal */
            longitude?: string;
            source?: components["schemas"]["SourceEnum"];
            is_default?: boolean;
        };
        PatchedCartItemUpdateRequest: {
            expected_cart_version?: number;
            expected_item_version?: number;
            quantity?: number;
            scope?: {
                [key: string]: unknown;
            };
        };
        /**
         * @description Skills and the supervisor flag only.
         *
         *     `display_name` is **not** editable here. It belongs to the global `CrewMember`, which several
         *     agencies may share, so one agency renaming a person would rename them on every other roster.
         *     Read-only with the reason stated beats editable-and-scoped, which a later caller can forget.
         */
        PatchedCrewMemberUpdateRequest: {
            skill_codes?: string[];
            is_supervisor?: boolean;
        };
        PatchedPartnerApplicationUpdateRequest: {
            expected_version?: number;
            display_name?: string;
            biography?: string;
            experience_years?: number;
            skill_codes?: string[];
            service_variant_ids?: string[];
            service_area_ids?: string[];
            consents?: components["schemas"]["PartnerConsentInputRequest"][];
            device_identifier?: string;
        };
        /**
         * @description What a Partner may change about themselves without a review.
         *
         *     `display_name` only. It is the name Customers see, so it is theirs to get
         *     right, and nothing downstream depends on its value.
         *
         *     **Not** `phone_number`. That is the login credential: changing it moves who
         *     can sign in, so it belongs behind an OTP challenge on the *new* number, not
         *     behind a field on a profile form. A `PATCH` that accepted it would either let
         *     a hijacked session lock the real Partner out, or let a typo do the same by
         *     accident.
         *
         *     Skills and service areas are absent for a different reason: Operations
         *     reviewed them, and a field here would silently reopen a reviewed decision.
         */
        PatchedPartnerProfileUpdateRequest: {
            display_name?: string;
        };
        /**
         * @description Partial update, one screen at a time, for save-and-resume.
         *
         *     Every field is optional and `None` means "not sent" rather than "clear this", matching
         *     `services.update_draft`, which skips `None` for exactly that reason.
         */
        PatchedRequirementUpdateRequest: {
            answers?: unknown;
            /** Format: uuid */
            address_id?: string | null;
            /** Format: date-time */
            requested_start?: string | null;
            flexibility_days?: number;
            /** Format: date */
            service_by?: string | null;
            budget_min_paise?: number | null;
            budget_max_paise?: number | null;
            additional_details?: string;
            language?: string;
        };
        PaymentAllocation: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string;
            /** Format: uuid */
            readonly fulfilment_line_id: string;
            readonly position: number;
            readonly amount: components["schemas"]["Money"];
            readonly refunded: components["schemas"]["Money"];
        };
        PaymentAttempt: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly checkout_id: string;
            /** Format: uuid */
            readonly booking_group_id: string;
            /** Format: uuid */
            readonly quote_id: string;
            readonly purpose: components["schemas"]["PurposeEnum"];
            readonly provider: string;
            readonly provider_public_key: string | null;
            readonly simulated_capture_available: boolean;
            readonly provider_order_id: string;
            readonly status: components["schemas"]["PaymentAttemptStatusEnum"];
            readonly reconciliation_state: components["schemas"]["ReconciliationStateEnum"];
            readonly failure_code: string;
            readonly version: number;
            readonly amount: components["schemas"]["Money"];
            /** Format: date-time */
            readonly expires_at: string | null;
            readonly allocations: components["schemas"]["PaymentAllocation"][];
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly updated_at: string;
        };
        PaymentAttemptCreateRequest: {
            /** Format: uuid */
            checkout_id: string;
            expected_checkout_version: number;
        };
        /**
         * @description * `PROVIDER_PENDING` - Provider pending
         *     * `CREATED` - Created
         *     * `AUTHORIZED` - Authorized
         *     * `CAPTURED` - Captured
         *     * `FAILED` - Failed
         *     * `EXPIRED` - Expired
         *     * `PARTIALLY_REFUNDED` - Partially refunded
         *     * `REFUNDED` - Refunded
         * @enum {string}
         */
        PaymentAttemptStatusEnum: "PROVIDER_PENDING" | "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "EXPIRED" | "PARTIALLY_REFUNDED" | "REFUNDED";
        /**
         * @description * `PENDING` - Pending verification
         *     * `VERIFIED` - Verified
         *     * `REJECTED` - Rejected
         *     * `REPLACED` - Replaced
         * @enum {string}
         */
        PayoutAccountStatusEnum: "PENDING" | "VERIFIED" | "REJECTED" | "REPLACED";
        /**
         * @description A run, with both signatures on it.
         *
         *     `proposed_by_id` and `approved_by_id` are both published so a console can render the
         *     maker-checker state without a second call — and so an approver can see at a glance that the
         *     batch in front of them is not one they proposed.
         */
        PayoutBatch: {
            /** Format: uuid */
            readonly id: string;
            readonly reference: string;
            readonly status: components["schemas"]["PayoutBatchStatusEnum"];
            /** Format: date-time */
            readonly period_start: string;
            /** Format: date-time */
            readonly period_end: string;
            /** Format: uuid */
            readonly proposed_by_id: string;
            /** Format: uuid */
            readonly approved_by_id: string | null;
            /** Format: date-time */
            readonly approved_at: string | null;
            /** Format: uuid */
            readonly cancelled_by_id: string | null;
            /** Format: date-time */
            readonly cancelled_at: string | null;
            readonly version: number;
            readonly total_paise: number;
            readonly currency: string;
            readonly item_count: number;
            readonly items: components["schemas"]["PayoutBatchItem"][];
            /** Format: date-time */
            readonly server_now: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        PayoutBatchItem: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly partner_id: string;
            /** Format: uuid */
            readonly ledger_entry_id: string;
            readonly status: components["schemas"]["PayoutBatchItemStatusEnum"];
            readonly amount_paise: number;
            readonly currency: string;
            readonly provider_payout_id: string;
            readonly failure_code: string;
            /** Format: date-time */
            readonly submitted_at: string | null;
            /** Format: date-time */
            readonly completed_at: string | null;
        };
        /**
         * @description * `RESERVED` - Reserved
         *     * `SUBMITTED` - Submitted
         *     * `PAID` - Paid
         *     * `FAILED` - Failed
         *     * `UNDER_REVIEW` - Under review
         *     * `RELEASED` - Released
         * @enum {string}
         */
        PayoutBatchItemStatusEnum: "RESERVED" | "SUBMITTED" | "PAID" | "FAILED" | "UNDER_REVIEW" | "RELEASED";
        /**
         * @description The list row. Items are omitted: a run can hold hundreds, and a list of runs is not where
         *     anybody reads them.
         */
        PayoutBatchList: {
            /** Format: uuid */
            readonly id: string;
            readonly reference: string;
            readonly status: components["schemas"]["PayoutBatchStatusEnum"];
            /** Format: date-time */
            readonly period_start: string;
            /** Format: date-time */
            readonly period_end: string;
            /** Format: uuid */
            readonly proposed_by_id: string;
            /** Format: uuid */
            readonly approved_by_id: string | null;
            readonly total_paise: number;
            readonly currency: string;
            readonly item_count: number;
            /** Format: date-time */
            readonly created_at: string;
        };
        PayoutBatchPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["PayoutBatchList"][];
        };
        /**
         * @description * `DRAFT` - Draft
         *     * `PENDING_APPROVAL` - Pending approval
         *     * `APPROVED` - Approved
         *     * `PAYING` - Paying
         *     * `PAID` - Paid
         *     * `FAILED` - Failed
         *     * `CANCELLED` - Cancelled
         * @enum {string}
         */
        PayoutBatchStatusEnum: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAYING" | "PAID" | "FAILED" | "CANCELLED";
        PlanQuoteCreateRequest: {
            /** Format: uuid */
            plan_id: string;
        };
        PlanUnit: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            /** Format: date-time */
            readonly starts_at: string;
            /** Format: date-time */
            readonly ends_at: string;
            readonly arrival_window_minutes: number;
            readonly estimated_duration_minutes: number;
            readonly items: components["schemas"]["PlanUnitItem"][];
            readonly reason_codes: unknown;
            readonly subtotal: components["schemas"]["Money"];
            readonly minimum_visit_adjustment: components["schemas"]["Money"];
            readonly platform_fee_allocation: components["schemas"]["Money"];
            readonly tax: components["schemas"]["Money"];
            readonly total: components["schemas"]["Money"];
        };
        PlanUnitItem: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly cart_item_id: string;
            readonly cart_item_version: number;
            readonly position: number;
            readonly quantity: number;
            readonly estimated_duration_minutes: number;
            readonly variant_snapshot: unknown;
            readonly scope_snapshot: unknown;
            readonly configuration_snapshot: unknown;
        };
        /** @description One visit's chosen start, keyed by the scheduling group it belongs to. */
        PreferredStartRequest: {
            group_key: string;
            /** Format: date-time */
            starts_at: string;
        };
        PrivacyRequest: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["PrivacyRequestKindEnum"];
            readonly status: components["schemas"]["PrivacyStatusEnum"];
            /** Format: date-time */
            readonly requested_at: string;
            /** Format: date-time */
            readonly completed_at: string | null;
        };
        PrivacyRequestCreateRequest: {
            kind: components["schemas"]["PrivacyRequestKindEnum"];
        };
        /**
         * @description * `ACCESS` - Access
         *     * `ERASURE` - Erasure
         * @enum {string}
         */
        PrivacyRequestKindEnum: "ACCESS" | "ERASURE";
        /**
         * @description * `RECEIVED` - Received
         *     * `IN_REVIEW` - In review
         *     * `COMPLETED` - Completed
         *     * `REJECTED` - Rejected
         * @enum {string}
         */
        PrivacyStatusEnum: "RECEIVED" | "IN_REVIEW" | "COMPLETED" | "REJECTED";
        ProbableDuplicate: {
            /** Format: uuid */
            readonly id: string;
            /** Format: date-time */
            readonly created_at: string;
            readonly summary: string;
            readonly status: string;
            readonly mergeable: boolean;
        };
        ProbableDuplicateList: {
            readonly probable_duplicates: components["schemas"]["ProbableDuplicate"][];
        };
        /**
         * @description * `PENDING` - Pending scan
         *     * `CLEAN` - Clean
         *     * `FAILED` - Failed scan
         * @enum {string}
         */
        ProcessingStatusEnum: "PENDING" | "CLEAN" | "FAILED";
        ProgressiveGate: {
            readonly gate: components["schemas"]["ProgressiveGateEnum"];
            readonly is_satisfied: boolean;
            readonly blocks: string[];
            readonly reason: string;
            readonly next_action: (components["schemas"]["GateNextActionEnum"] | components["schemas"]["NullEnum"]) | null;
        };
        /**
         * @description * `KYC` - Identity verification
         *     * `PAYOUT_DETAILS` - Payout account
         *     * `CREW_ROSTER` - Crew roster
         * @enum {string}
         */
        ProgressiveGateEnum: "KYC" | "PAYOUT_DETAILS" | "CREW_ROSTER";
        /**
         * @description **Advisory.** The commands enforce these; this read only decides what the UI explains first.
         *
         *     A client treating it as authoritative would block somebody whose KYC completed thirty seconds
         *     ago and admit somebody suspended thirty seconds ago.
         */
        ProgressiveGateList: {
            readonly gates: components["schemas"]["ProgressiveGate"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        /** @description A vendor's own quote, read back to that vendor. */
        Proposal: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly requirement: string;
            /** Format: uuid */
            readonly invitation: string;
            /** @default 1 */
            readonly revision: number;
            readonly status: components["schemas"]["ProposalStatusEnum"];
            readonly usability: components["schemas"]["ProposalUsabilityEnum"];
            readonly rejection_reason: components["schemas"]["RejectionReasonEnum"];
            /** Format: uuid */
            readonly site_visit: string | null;
            /** Format: date-time */
            readonly revalidation_requested_at: string | null;
            readonly rate_paise_per_worker_day: number | null;
            readonly minimum_days: number | null;
            readonly worker_count: number | null;
            readonly total_paise: number;
            readonly tax_paise: number;
            readonly tax_basis: components["schemas"]["ProposalTaxBasisEnum"];
            readonly commission_treatment: string;
            readonly inclusions: unknown;
            readonly exclusions: unknown;
            readonly stages: components["schemas"]["ProposalStage"][];
            readonly material_lines: components["schemas"]["ProposalMaterialLine"][];
            readonly warranty_terms: string;
            /** Format: date-time */
            readonly valid_until: string | null;
            /** Format: date-time */
            readonly vendor_confirmed_at: string | null;
            /** Format: date-time */
            readonly submitted_at: string;
        };
        /**
         * @description Both composers in one shape; the domain validates which fields the archetype requires.
         *
         *     Deliberately not two serializers. `proposals.submit_proposal` already runs `_assert_a3_shape`
         *     or `_assert_a5_shape` against the requirement's own archetype, and a second archetype check
         *     here would be a copy of that rule which could disagree with it. A vendor sending A5 stages on
         *     an A3 requirement gets one refusal, from the layer that knows.
         */
        ProposalCreateRequest: {
            /** Format: uuid */
            invitation_id: string;
            total_paise: number;
            tax_basis: components["schemas"]["ProposalTaxBasisEnum"];
            /** @default 0 */
            tax_paise: number;
            rate_paise_per_worker_day?: number | null;
            minimum_days?: number | null;
            worker_count?: number | null;
            stages?: components["schemas"]["ProposalStageRequest"][];
            material_lines?: components["schemas"]["ProposalMaterialLineRequest"][];
            inclusions?: string[];
            exclusions?: string[];
            warranty_terms?: string;
            /** Format: date-time */
            valid_until?: string | null;
            commission_treatment?: string;
            /** Format: uuid */
            site_visit_id?: string | null;
        };
        /**
         * @description One material line on an A5 estimate — **not** a stage, and that is the whole point.
         *
         *     Until 1.26.0 the wire carried exactly one money-carrying row type, so a vendor pricing cement
         *     sent it as a `ProposalStage` with their own title. A stage is a unit of evidence, approval and
         *     release, so that made a bag of cement a fundable milestone somebody had to *approve as work*.
         *     `README.md` is explicit that material money is spent rather than earned and therefore cannot be
         *     recovered like an unearned work stage; a row type that cannot tell the two apart cannot carry
         *     that rule (`M2-BE-543`).
         *
         *     `quantity` and `unit` are here because a material line without them is unreadable in a
         *     comparison — "cement, 1,20,000 paise" against "cement, 40 bags at 3,000" is the difference
         *     between two quotes a Customer can compare and two they cannot. `unit` is free text on purpose:
         *     bags, cubic metres, running feet and coils are all real, and a closed vocabulary authored here
         *     would refuse whichever trade nobody thought of.
         */
        ProposalMaterialLine: {
            title: string;
            /** @default 1 */
            quantity: number;
            /** @default  */
            unit: string;
            amount_paise: number;
        };
        /**
         * @description One material line on an A5 estimate — **not** a stage, and that is the whole point.
         *
         *     Until 1.26.0 the wire carried exactly one money-carrying row type, so a vendor pricing cement
         *     sent it as a `ProposalStage` with their own title. A stage is a unit of evidence, approval and
         *     release, so that made a bag of cement a fundable milestone somebody had to *approve as work*.
         *     `README.md` is explicit that material money is spent rather than earned and therefore cannot be
         *     recovered like an unearned work stage; a row type that cannot tell the two apart cannot carry
         *     that rule (`M2-BE-543`).
         *
         *     `quantity` and `unit` are here because a material line without them is unreadable in a
         *     comparison — "cement, 1,20,000 paise" against "cement, 40 bags at 3,000" is the difference
         *     between two quotes a Customer can compare and two they cannot. `unit` is free text on purpose:
         *     bags, cubic metres, running feet and coils are all real, and a closed vocabulary authored here
         *     would refuse whichever trade nobody thought of.
         */
        ProposalMaterialLineRequest: {
            title: string;
            /** @default 1 */
            quantity: number;
            /** @default  */
            unit: string;
            amount_paise: number;
        };
        ProposalPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["Proposal"][];
        };
        ProposalRejectRequest: {
            reason: components["schemas"]["RejectionReasonEnum"];
            /** @default  */
            note: string;
        };
        /**
         * @description Selection is not a booking, and this shape says so.
         *
         *     `reconfirm_by` is the whole point: the Customer has chosen and the vendor has not yet agreed.
         *     Null when the area carries no operating windows and no business-hours deadline could be
         *     computed — which is an unset clock, not an unlimited one.
         */
        ProposalSelection: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly requirement: string;
            /** Format: uuid */
            readonly proposal: string;
            /** Format: uuid */
            readonly partner: string;
            readonly status: components["schemas"]["ProposalSelectionStatusEnum"];
            /** Format: date-time */
            readonly reconfirm_by: string | null;
            /** Format: date-time */
            readonly decided_at: string | null;
            readonly decline_reason_code: string;
            readonly engagement_id: string | null;
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description * `PENDING_RECONFIRMATION` - Awaiting the vendor
         *     * `CONFIRMED` - Vendor reconfirmed
         *     * `DECLINED` - Vendor declined
         *     * `EXPIRED` - Vendor did not answer in time
         *     * `WITHDRAWN` - Customer withdrew the selection
         * @enum {string}
         */
        ProposalSelectionStatusEnum: "PENDING_RECONFIRMATION" | "CONFIRMED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";
        /**
         * @description One A5 milestone, published so two vendors cannot send two incomparable structures.
         *
         *     Until 1.24.0 `stages` was an untyped list and the domain read exactly one key, `amount_paise`.
         *     Everything a Customer needs to *read* a stage — what it delivers, when it ends — was
         *     client-authored, so the comparison view had nothing stable to render (`M2-FE-309`).
         *
         *     `title` is required and the rest are not: a stage with a name and an amount is a comparable
         *     stage, and refusing one because a vendor did not fill in an end date would push them back to
         *     a single-line quote.
         */
        ProposalStage: {
            title: string;
            /** @default  */
            deliverable: string;
            amount_paise: number;
            /** Format: date */
            ends_on?: string | null;
        };
        /**
         * @description One A5 milestone, published so two vendors cannot send two incomparable structures.
         *
         *     Until 1.24.0 `stages` was an untyped list and the domain read exactly one key, `amount_paise`.
         *     Everything a Customer needs to *read* a stage — what it delivers, when it ends — was
         *     client-authored, so the comparison view had nothing stable to render (`M2-FE-309`).
         *
         *     `title` is required and the rest are not: a stage with a name and an amount is a comparable
         *     stage, and refusing one because a vendor did not fill in an end date would push them back to
         *     a single-line quote.
         */
        ProposalStageRequest: {
            title: string;
            /** @default  */
            deliverable: string;
            amount_paise: number;
            /** Format: date */
            ends_on?: string | null;
        };
        /**
         * @description * `SUBMITTED` - Submitted
         *     * `SUPERSEDED` - Superseded
         *     * `WITHDRAWN` - Withdrawn
         *     * `EXPIRED` - Expired
         *     * `SELECTED` - Selected
         *     * `REJECTED` - Rejected
         *     * `ACCEPTED` - Accepted by the vendor
         *     * `LAPSED` - Lapsed after selection
         * @enum {string}
         */
        ProposalStatusEnum: "SUBMITTED" | "SUPERSEDED" | "WITHDRAWN" | "EXPIRED" | "SELECTED" | "REJECTED" | "ACCEPTED" | "LAPSED";
        /**
         * @description * `INCLUSIVE` - Tax included in the total
         *     * `EXCLUSIVE` - Tax added to the total
         * @enum {string}
         */
        ProposalTaxBasisEnum: "INCLUSIVE" | "EXCLUSIVE";
        /**
         * @description * `USABLE` - Usable
         *     * `OUT_OF_BUDGET` - Outside the stated budget
         *     * `INCOMPLETE` - Incomplete
         * @enum {string}
         */
        ProposalUsabilityEnum: "USABLE" | "OUT_OF_BUDGET" | "INCOMPLETE";
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        ProposeAmendmentRequestRequest: {
            expected_version: number;
            reason: string;
            task_quantity: number;
        };
        ProposePayoutBatchRequestRequest: {
            reference: string;
            /** Format: date-time */
            period_start: string;
            /** Format: date-time */
            period_end: string;
        };
        /**
         * @description * `BOOKING_GROUP` - Booking group
         *     * `SCOPE_AMENDMENT_REVISION` - Scope amendment revision
         *     * `M2_QUOTE_UNLOCK` - M2 quote unlock
         *     * `M2_VISIT_PLAN` - M2 visit plan
         *     * `M2_SITE_VISIT_FEE` - M2 site visit fee
         *     * `M2_STAGE_FUNDING` - M2 stage funding
         *     * `M2_MATERIAL_ADVANCE` - M2 material advance
         *     * `M2_SCOPE_AMENDMENT` - M2 engagement scope amendment
         * @enum {string}
         */
        PurposeEnum: "BOOKING_GROUP" | "SCOPE_AMENDMENT_REVISION" | "M2_QUOTE_UNLOCK" | "M2_VISIT_PLAN" | "M2_SITE_VISIT_FEE" | "M2_STAGE_FUNDING" | "M2_MATERIAL_ADVANCE" | "M2_SCOPE_AMENDMENT";
        QuestionAnswerRequest: {
            answer: string;
        };
        /**
         * @description * `CUSTOMER` - Customer
         *     * `VENDOR` - Vendor
         *     * `OPERATIONS` - Operations
         * @enum {string}
         */
        QuestionAskerRoleEnum: "CUSTOMER" | "VENDOR" | "OPERATIONS";
        QuestionCreateRequest: {
            question: string;
        };
        Quote: {
            /** Format: uuid */
            readonly id: string;
            readonly version: number;
            /** Format: date-time */
            readonly server_now: string;
            /** Format: date-time */
            readonly expires_at: string;
            readonly estimated_duration_minutes: number;
            readonly arrival_window: components["schemas"]["QuoteArrivalWindow"];
            readonly lines: components["schemas"]["QuoteLine"][];
            readonly subtotal: components["schemas"]["Money"];
            readonly platform_fee: components["schemas"]["QuoteLine"];
            readonly tax: components["schemas"]["QuoteTax"];
            readonly total: components["schemas"]["Money"];
            readonly cancellation_policy: components["schemas"]["CancellationPolicy"];
            /** Format: date-time */
            readonly created_at: string;
        };
        QuoteArrivalWindow: {
            readonly id: string;
            /** Format: date-time */
            readonly starts_at: string;
            /** Format: date-time */
            readonly ends_at: string;
        };
        QuoteCreateRequest: {
            /** Format: uuid */
            address_id: string;
            window_id: string;
        };
        QuoteLine: {
            readonly code: string;
            readonly label: string;
            readonly amount: components["schemas"]["Money"];
        };
        /**
         * @description * `SERVICE` - Service
         *     * `MINIMUM_VISIT_ADJUSTMENT` - Minimum visit adjustment
         *     * `PLATFORM_FEE_ALLOCATION` - Platform fee allocation
         * @enum {string}
         */
        QuoteLineKindEnum: "SERVICE" | "MINIMUM_VISIT_ADJUSTMENT" | "PLATFORM_FEE_ALLOCATION";
        QuoteTax: {
            readonly code: string;
            readonly label: string;
            readonly amount: components["schemas"]["Money"];
            readonly included_in_total: boolean;
        };
        /**
         * @description **This payload goes to a Customer who has paid nothing.**
         *
         *     An explicit field list rather than a `ModelSerializer`, because the difference between the two
         *     is one `fields` edit away from shipping a vendor's name to an unpaid Customer. The price
         *     *band* is the point: enough to judge whether unlocking is worth it, not enough to act on.
         */
        QuoteTeaser: {
            /** Format: uuid */
            readonly proposal_id: string;
            readonly vendor_type: string;
            readonly is_verified: boolean;
            readonly price_band_low_paise: number;
            readonly price_band_high_paise: number;
            readonly is_out_of_budget: boolean;
        };
        QuoteTeaserList: {
            readonly teasers: components["schemas"]["QuoteTeaser"][];
            readonly usable_quote_count: number;
            readonly unlock_available: boolean;
            /** Format: date-time */
            readonly server_now: string;
        };
        /** @description The A3 purchase. `ACTIVE` is only ever reached from a verified provider callback. */
        QuoteUnlock: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["QuoteUnlockStatusEnum"];
            readonly price_paise: number;
            readonly non_responsive_rejection_count: number;
            readonly receipt_series: string;
            readonly receipt_sequence: number | null;
            /** Format: date-time */
            readonly activated_at: string | null;
            /** Format: date-time */
            readonly consumed_at: string | null;
            /** Format: date-time */
            readonly refunded_at: string | null;
        };
        /**
         * @description * `PENDING` - Awaiting the provider
         *     * `ACTIVE` - Active
         *     * `CONSUMED` - Consumed by an engagement
         *     * `REFUNDED` - Refunded
         *     * `FAILED` - Failed
         * @enum {string}
         */
        QuoteUnlockStatusEnum: "PENDING" | "ACTIVE" | "CONSUMED" | "REFUNDED" | "FAILED";
        RankedCandidate: {
            /** Format: uuid */
            partner_id: string;
            rank: number;
            factors: {
                [key: string]: unknown;
            };
        };
        /**
         * @description * `PARTNER_UNREACHABLE` - Partner unreachable
         *     * `CUSTOMER_REQUEST` - Customer request
         *     * `SAFETY_CONCERN` - Safety concern
         *     * `DUPLICATE_DISPATCH` - Duplicate dispatch
         *     * `STUCK_DISPATCH` - Stuck dispatch
         *     * `OPERATIONS_ERROR` - Operations error
         * @enum {string}
         */
        ReasonEnum: "PARTNER_UNREACHABLE" | "CUSTOMER_REQUEST" | "SAFETY_CONCERN" | "DUPLICATE_DISPATCH" | "STUCK_DISPATCH" | "OPERATIONS_ERROR";
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        ReasonedCommandRequest: {
            expected_version: number;
            reason: string;
        };
        /**
         * @description * `PENDING` - Pending
         *     * `IN_SYNC` - In sync
         *     * `NEEDS_ATTENTION` - Needs attention
         * @enum {string}
         */
        ReconciliationStateEnum: "PENDING" | "IN_SYNC" | "NEEDS_ATTENTION";
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        RecoverBookingRequestRequest: {
            expected_version: number;
            /** Format: uuid */
            offer_id: string;
        };
        /**
         * @description * `WAIT` - WAIT
         *     * `PAYMENT_REQUIRED` - PAYMENT_REQUIRED
         *     * `REPLAN` - REPLAN
         *     * `NONE` - NONE
         * @enum {string}
         */
        RecoveryActionEnum: "WAIT" | "PAYMENT_REQUIRED" | "REPLAN" | "NONE";
        Refund: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly order_id: string | null;
            /** Format: uuid */
            readonly payment_attempt_id: string | null;
            readonly status: components["schemas"]["RefundStatusEnum"];
            readonly reason_code: string;
            readonly reconciliation_state: components["schemas"]["ReconciliationStateEnum"];
            readonly failure_code: string;
            readonly provider_refund_id: string;
            readonly amount: components["schemas"]["Money"];
            readonly allocations: components["schemas"]["RefundAllocation"][];
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly submitted_at: string | null;
            /** Format: date-time */
            readonly completed_at: string | null;
        };
        RefundAllocation: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly payment_allocation_id: string;
            /** Format: uuid */
            readonly fulfilment_unit_id: string;
            readonly amount: components["schemas"]["Money"];
        };
        RefundCreateRequest: {
            /** Format: uuid */
            order_id: string;
            fulfilment_unit_ids: string[];
            reason_code: string;
        };
        /**
         * @description * `REQUESTED` - Requested
         *     * `SUBMITTED` - Submitted
         *     * `PROCESSING` - Processing
         *     * `SUCCEEDED` - Succeeded
         *     * `FAILED` - Failed
         *     * `UNDER_REVIEW` - Under review
         * @enum {string}
         */
        RefundStatusEnum: "REQUESTED" | "SUBMITTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "UNDER_REVIEW";
        /**
         * @description * `NON_RESPONSIVE` - Ignored the stated scope
         *     * `NOT_CHOSEN` - Customer chose another vendor
         * @enum {string}
         */
        RejectionReasonEnum: "NON_RESPONSIVE" | "NOT_CHOSEN";
        ReleaseKillSwitchRequestRequest: {
            scope: components["schemas"]["KillSwitchScopeEnum"];
            /** @default  */
            target: string;
        };
        RequirementAttachment: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["RequirementAttachmentKindEnum"];
            readonly scan_status: string;
            readonly scan_failure_reason: string;
            readonly size_bytes: number;
            readonly language: string;
        };
        /**
         * @description * `IMAGE` - Image
         *     * `VIDEO` - Video
         *     * `AUDIO` - Audio
         *     * `VOICE_NOTE` - Voice note
         *     * `DOCUMENT` - Document
         * @enum {string}
         */
        RequirementAttachmentKindEnum: "IMAGE" | "VIDEO" | "AUDIO" | "VOICE_NOTE" | "DOCUMENT";
        RequirementCreateRequest: {
            /** Format: uuid */
            variant_id: string;
            answers?: unknown;
            /** @default en-IN */
            language: string;
        };
        /**
         * @description The full record the four-screen flow reads after every write.
         *
         *     `inferred_lifecycle` is published but is never rendered as an archetype name — `GAP-006` is
         *     explicit that the Customer describes what they need and the platform works out the lifecycle.
         *     `lifecycle_explanation` is the sentence they actually see.
         */
        RequirementDraft: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["RequirementStatusEnum"];
            readonly category_slug: string;
            readonly service_name: string;
            readonly inferred_lifecycle: string;
            readonly lifecycle_explanation: string | null;
            readonly answers: unknown;
            readonly missing_required_answers: string[];
            /** Format: uuid */
            readonly address_id: string | null;
            /** Format: date-time */
            readonly requested_start: string | null;
            readonly flexibility_days: number;
            readonly is_date_flexible: boolean;
            /** Format: date */
            readonly service_by: string | null;
            /** Format: date-time */
            readonly quote_delivery_deadline_at: string;
            readonly teaser_count: number;
            readonly closure_reason: string | null;
            /**
             * @description Always `True`, and read from the server on purpose.
             *
             *     Submitting a requirement is free in both archetypes — the A3 unlock and the A5 visit plan
             *     are separate purchases made later, against a delivered quote or a confirmed visit. A screen
             *     that hardcodes the promise keeps making it after the policy changes; this is the field that
             *     would go `false` first.
             */
            readonly is_free: boolean;
            readonly budget_min_paise: number | null;
            readonly budget_max_paise: number | null;
            readonly language: string;
            readonly additional_details: string;
            readonly attachments: components["schemas"]["RequirementAttachment"][];
            readonly server_now: string;
        };
        /**
         * @description One question and its answer, on the timeline both parties read.
         *
         *     `asked_by_role` is new at 1.26.0 and is not decoration: clarification ran one way until this
         *     release, so "who asked" was implied by the surface you were looking at. Now that a Customer can
         *     ask a vendor about a delivered quote, a client with no direction field renders both halves of a
         *     conversation as though the other side started it, and neither app can tell whose turn it is.
         *
         *     Derived by **identity comparison, not by inference**: the requirement records its Customer and
         *     the invitation records its Partner's user, so the three answers are exact rather than guessed.
         *     `OPERATIONS` covers an assisted question, which has no route yet and will have one in Wave C6 —
         *     naming it now is what stops the answer defaulting to `VENDOR` when it arrives.
         */
        RequirementQuestion: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly invitation: string;
            readonly asked_by_role: components["schemas"]["QuestionAskerRoleEnum"];
            readonly question: string;
            readonly answer: string;
            /** Format: date-time */
            readonly asked_at: string;
            /** Format: date-time */
            readonly answered_at: string | null;
        };
        /**
         * @description * `PENDING` - Pending
         *     * `VERIFIED` - Verified
         *     * `INFECTED` - Rejected by the malware scan
         *     * `FAILED` - Failed
         * @enum {string}
         */
        RequirementScanStatusEnum: "PENDING" | "VERIFIED" | "INFECTED" | "FAILED";
        /**
         * @description * `DRAFT` - Draft
         *     * `MATCHING` - Matching
         *     * `VISITS_BOOKED` - Visits booked
         *     * `QUOTES_READY` - Quotes ready
         *     * `UNLOCKED` - Unlocked
         *     * `SELECTED` - Selected
         *     * `ENGAGED` - Engaged
         *     * `CLOSED_NO_SUPPLY` - Closed: no supply
         *     * `CLOSED_SLA_BREACH` - Closed: delivery promise missed
         *     * `CLOSED_EXPIRED` - Closed: needed-by date passed
         *     * `CLOSED_ABANDONED` - Closed: abandoned
         *     * `CLOSED_COMPLETE` - Closed: complete
         *     * `CLOSED_CANCELLED` - Closed: cancelled
         * @enum {string}
         */
        RequirementStatusEnum: "DRAFT" | "MATCHING" | "VISITS_BOOKED" | "QUOTES_READY" | "UNLOCKED" | "SELECTED" | "ENGAGED" | "CLOSED_NO_SUPPLY" | "CLOSED_SLA_BREACH" | "CLOSED_EXPIRED" | "CLOSED_ABANDONED" | "CLOSED_COMPLETE" | "CLOSED_CANCELLED";
        RequirementSubmitRequest: {
            /** @default false */
            allow_duplicate: boolean;
        };
        RequirementSubmitted: {
            /** Format: uuid */
            readonly id: string;
            readonly status: string;
            /** Format: date */
            readonly service_by: string | null;
            /** Format: date-time */
            readonly quote_delivery_deadline_at: string | null;
            readonly is_free: boolean;
            /** Format: date-time */
            readonly server_now: string;
        };
        /** @description A `My requests` row. */
        RequirementSummary: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["RequirementStatusEnum"];
            readonly category_slug: string;
            readonly service_name: string;
            readonly lifecycle_explanation: string | null;
            /** Format: date */
            readonly service_by: string | null;
            /** Format: date-time */
            readonly quote_delivery_deadline_at: string;
            readonly teaser_count: number;
            readonly closure_reason: string | null;
            /** Format: date-time */
            readonly last_activity_at: string;
        };
        /**
         * @description The page envelope `My requests` has always been sent, now also declared.
         *
         *     Until 13 August the operation declared a bare array and the view returned this envelope, so a
         *     client generated from the contract threw on its first real request and every consumer had to
         *     hand-write a narrowing around the generated type. The shape is
         *     `carts.serializers.BookingGroupPageSerializer`'s, because there is no reason for two page
         *     envelopes in one API.
         */
        RequirementSummaryPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["RequirementSummary"][];
        };
        RequirementTimeline: {
            readonly events: components["schemas"]["RequirementTimelineEvent"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        RequirementTimelineEvent: {
            readonly id: string;
            /** Format: date-time */
            readonly at: string;
            readonly type: string;
            readonly detail: unknown;
        };
        /**
         * @description An A3/A5 variant, as the guided-requirement flow needs it.
         *
         *     **Deliberately not `ServiceVariantConfigurationSerializer`.** That one publishes
         *     `starting_price`, `minimum_service_subtotal` and `task_lines`, all read from annotations only
         *     `_public_variants` adds — so serializing an M2 variant through it raises `AttributeError`. It
         *     would also be the wrong shape if it worked: an A3 or A5 variant has no rate, because its price
         *     is the vendor's quote, and a money field here would be a number this platform invented.
         *
         *     `questions` is the load-bearing field. Screen 1 of the four-screen flow renders exactly these
         *     rows, and `services.submit_requirement` validates the answers against the *same* authored
         *     schema — so a variant published without them is a flow whose first screen has nothing to ask.
         */
        RequirementVariant: {
            /** Format: uuid */
            readonly id: string;
            readonly code: string;
            readonly name: string;
            readonly description: string;
            readonly fulfilment_archetype: string;
            readonly questions: components["schemas"]["ServiceQuestion"][];
        };
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        RescheduleBookingRequestRequest: {
            expected_version: number;
            /** Format: date-time */
            new_requested_start: string;
        };
        /**
         * @description Whether a visit may be moved right now, and why not when it may not.
         *
         *     Published rather than derived client-side because the rule reads the frozen quote-time
         *     cancellation ladder: a visit is movable only while its *free* band still applies. That
         *     snapshot never leaves the server, so a client can only guess — and guessing here means
         *     offering a picker that refuses every slot in it.
         */
        ReschedulePreview: {
            is_available: boolean;
            unavailable_reason: string;
            /** Format: date-time */
            earliest_start: string;
        };
        ResolveCaseRequestRequest: {
            expected_version: number;
            resolution: string;
            note: string;
        };
        ReverseGeocodeRequestRequest: {
            /** Format: decimal */
            latitude: string;
            /** Format: decimal */
            longitude: string;
        };
        ReverseGeocodeResponse: {
            readonly formatted_address: string;
            readonly line1: string;
            readonly locality: string;
            readonly city: string;
            readonly state: string;
            readonly postal_code: string;
            readonly country_code: string;
            /** Format: decimal */
            readonly latitude: string;
            /** Format: decimal */
            readonly longitude: string;
            readonly provider: string;
        };
        RoleSwitchRequest: {
            role: string;
        };
        /**
         * @description * `PENDING` - Pending scan
         *     * `CLEAN` - Clean
         *     * `REJECTED` - Rejected
         *     * `FAILED` - Scan failed
         * @enum {string}
         */
        ScanStatusEnum: "PENDING" | "CLEAN" | "REJECTED" | "FAILED";
        /**
         * @description One separately-schedulable visit.
         *
         *     `key` is opaque to the client and is sent back with the chosen start. It
         *     identifies the visit by its membership, so a cart edit produces different keys
         *     and the server can refuse a schedule aimed at visits that no longer exist.
         */
        SchedulingGroup: {
            key: string;
            label: string;
            estimated_duration_minutes: number;
            cart_item_ids: string[];
        };
        SchedulingGroups: {
            cart_version: number;
            groups: components["schemas"]["SchedulingGroup"][];
        };
        SchedulingGroupsRequestRequest: {
            /** Format: uuid */
            address_id: string;
            expected_cart_version: number;
        };
        ScopeAmendment: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly booking_id: string;
            readonly status: components["schemas"]["ScopeAmendmentStatusEnum"];
            readonly version: number;
            readonly reason: string;
            readonly evidence_required: boolean;
            readonly total_paise: number;
            readonly currency: string;
            /** Format: date-time */
            readonly expires_at: string;
            /** Format: date-time */
            readonly responded_at: string | null;
            readonly lines: components["schemas"]["ScopeAmendmentLine"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        ScopeAmendmentLine: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly kind: components["schemas"]["ScopeAmendmentLineKindEnum"];
            readonly code: string;
            readonly label: string;
            readonly quantity: number;
            readonly amount_paise: number;
            readonly currency: string;
        };
        /**
         * @description * `TASK` - Task
         *     * `MATERIAL` - Material
         *     * `LABOUR_DAY` - Additional worker-day (M2 A3)
         *     * `PROJECT_WORK` - Additional or reduced project work (M2 A5)
         * @enum {string}
         */
        ScopeAmendmentLineKindEnum: "TASK" | "MATERIAL" | "LABOUR_DAY" | "PROJECT_WORK";
        /**
         * @description * `PROPOSED` - Proposed
         *     * `CUSTOMER_APPROVED` - Customer approved
         *     * `CUSTOMER_DECLINED` - Customer declined
         *     * `PAYMENT_PENDING` - Payment pending
         *     * `AUTHORIZED` - Authorized
         *     * `EXPIRED` - Expired
         * @enum {string}
         */
        ScopeAmendmentStatusEnum: "PROPOSED" | "CUSTOMER_APPROVED" | "CUSTOMER_DECLINED" | "PAYMENT_PENDING" | "AUTHORIZED" | "EXPIRED";
        SelectionCreateRequest: {
            /** Format: uuid */
            proposal_id: string;
        };
        SelectionDeclineRequest: {
            reason_code: string;
        };
        ServiceArea: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly timezone: string;
        };
        ServiceCard: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly short_description: string;
            readonly category_slug: string;
            readonly subcategory_slug: string;
            readonly starting_price: components["schemas"]["Money"] | null;
            /** Format: uuid */
            readonly bookable_variant_id: string | null;
            readonly request_archetypes: string[];
            readonly cover: components["schemas"]["ServiceMedia"] | null;
        };
        ServiceDetail: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly short_description: string;
            readonly category_slug: string;
            readonly subcategory_slug: string;
            readonly starting_price: components["schemas"]["Money"] | null;
            /** Format: uuid */
            readonly bookable_variant_id: string | null;
            readonly request_archetypes: string[];
            readonly cover: components["schemas"]["ServiceMedia"] | null;
            description?: string;
            readonly variants: components["schemas"]["ServiceVariantConfiguration"][];
            readonly requirement_variants: components["schemas"]["RequirementVariant"][];
            readonly policies: components["schemas"]["ServicePolicy"][];
            readonly media: components["schemas"]["ServiceMedia"][];
        };
        ServiceMedia: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["ServiceMediaKindEnum"];
            /** Format: uri */
            readonly url: string;
            readonly alt_text: string;
        };
        /**
         * @description * `COVER` - Cover
         *     * `GALLERY` - Gallery
         * @enum {string}
         */
        ServiceMediaKindEnum: "COVER" | "GALLERY";
        ServicePolicy: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["ServicePolicyKindEnum"];
            readonly title: string;
            readonly text: string;
            readonly display_order: number;
        };
        /**
         * @description * `INCLUDED` - Included
         *     * `EXCLUDED` - Not included
         *     * `GOOD_TO_KNOW` - Good to know
         *     * `PROCESS` - Process step
         * @enum {string}
         */
        ServicePolicyKindEnum: "INCLUDED" | "EXCLUDED" | "GOOD_TO_KNOW" | "PROCESS";
        ServiceQuestion: {
            /** Format: uuid */
            readonly id: string;
            readonly code: string;
            readonly prompt: string;
            readonly help_text: string;
            readonly kind: components["schemas"]["ServiceQuestionKindEnum"];
            readonly is_required: boolean;
            readonly validation_rules: unknown;
            readonly options: components["schemas"]["ServiceQuestionOption"][];
        };
        /**
         * @description * `SINGLE_CHOICE` - Single choice
         *     * `MULTIPLE_CHOICE` - Multiple choice
         *     * `BOOLEAN` - Yes or no
         *     * `NUMBER` - Number
         *     * `TEXT` - Text
         * @enum {string}
         */
        ServiceQuestionKindEnum: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "BOOLEAN" | "NUMBER" | "TEXT";
        ServiceQuestionOption: {
            /** Format: uuid */
            readonly id: string;
            readonly code: string;
            readonly label: string;
            readonly description: string;
        };
        ServiceVariantConfiguration: {
            /** Format: uuid */
            readonly id: string;
            readonly code: string;
            readonly name: string;
            readonly description: string;
            readonly fulfilment_archetype: string;
            readonly starting_price: components["schemas"]["Money"];
            readonly minimum_service_subtotal: components["schemas"]["Money"];
            readonly task_lines: components["schemas"]["A1TaskLine"][];
            required_skill_code: string;
            readonly questions: components["schemas"]["ServiceQuestion"][];
        };
        ServiceabilityRequestRequest: {
            postal_code: string;
            /** Format: uuid */
            service_variant_id?: string;
            /** Format: date-time */
            requested_start?: string;
            duration_minutes?: number;
        };
        ServiceabilityResponse: {
            readonly is_serviceable: boolean;
            readonly reason_code: string | null;
            readonly service_area: components["schemas"]["ServiceArea"] | null;
            /** Format: date-time */
            readonly server_now: string;
        };
        SessionState: {
            readonly user: components["schemas"]["User"] | null;
            readonly active_role: string | null;
            /** Format: date-time */
            readonly session_expires_at: string | null;
        };
        /**
         * @description One visit, in both its shapes.
         *
         *     `is_plan_visit` is the field that decides how the whole record reads. A plan visit is paid for
         *     out of the A5 visit plan, occupies a share of it and opens an estimate window when it completes;
         *     an ad-hoc visit is a vendor-priced journey with none of that behind it. Publishing the flag
         *     rather than letting a client infer it from `fee_paise` keeps the two from being rendered as one
         *     thing with a different price.
         */
        SiteVisit: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["SiteVisitStatusEnum"];
            readonly is_plan_visit: boolean;
            /**
             * @description The area's zone, or the platform's own as a last resort.
             *
             *     A visit cannot exist on a requirement without a serviceable area — `_assert_submittable`
             *     refuses the submit — so the fallback is unreachable through any live path. It is written as
             *     the deployment's `TIME_ZONE` rather than a literal so that the one impossible case cannot
             *     become a second place Hyderabad is hardcoded.
             */
            readonly timezone: string;
            readonly fee_paise: number;
            readonly adjusts_against_final_price: boolean;
            /** Format: date-time */
            readonly scheduled_for: string | null;
            readonly duration_minutes: number | null;
            /** Format: date-time */
            readonly arrival_confirmed_at: string | null;
            readonly arrival_method: components["schemas"]["VisitArrivalMethodEnum"];
            /** Format: date-time */
            readonly completed_at: string | null;
            /** Format: date-time */
            readonly estimate_due_at: string | null;
            readonly cancellation_reason_code: string;
        };
        SiteVisitCompleteRequest: {
            outcome_notes?: string;
        };
        SiteVisitRequestRequest: {
            fee_paise: number;
            /** @default true */
            adjusts_against_final_price: boolean;
        };
        SiteVisitScheduleRequest: {
            /** Format: date-time */
            scheduled_for: string;
        };
        /**
         * @description * `REQUESTED` - Requested
         *     * `SCHEDULED` - Scheduled
         *     * `IN_PROGRESS` - Vendor has arrived
         *     * `COMPLETED` - Completed
         *     * `CANCELLED` - Cancelled
         *     * `VENDOR_NO_SHOW` - Vendor did not arrive
         *     * `CUSTOMER_NO_SHOW` - Nobody was on site
         * @enum {string}
         */
        SiteVisitStatusEnum: "REQUESTED" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "VENDOR_NO_SHOW" | "CUSTOMER_NO_SHOW";
        /**
         * @description * `MANUAL` - Manual
         *     * `REVERSE_GEOCODED` - Reverse geocoded
         * @enum {string}
         */
        SourceEnum: "MANUAL" | "REVERSE_GEOCODED";
        StageCorrectionRequest: {
            note: string;
        };
        StageDisputeDecisionRequest: {
            outcome: components["schemas"]["StageDisputeOutcomeEnum"];
            note: string;
        };
        /**
         * @description * `APPROVE` - Approve the stage as submitted
         *     * `REQUEST_CORRECTION` - Send it back for correction
         * @enum {string}
         */
        StageDisputeOutcomeEnum: "APPROVE" | "REQUEST_CORRECTION";
        /**
         * @description * `NOT_DONE` - The work was not done
         *     * `PARTIALLY_DONE` - Only part of the work was done
         *     * `POOR_QUALITY` - The work was done badly
         *     * `WRONG_SCOPE` - This is not what was agreed
         *     * `OTHER` - Another reason
         * @enum {string}
         */
        StageDisputeReasonEnum: "NOT_DONE" | "PARTIALLY_DONE" | "POOR_QUALITY" | "WRONG_SCOPE" | "OTHER";
        StageDisputeRequest: {
            reason_code: components["schemas"]["StageDisputeReasonEnum"];
            /** @default  */
            note: string;
        };
        /**
         * @description What the vendor showed, as both parties read it.
         *
         *     `object_key` is **not** published. It is a storage path, and publishing one turns every
         *     evidence read into an enumeration surface; a short-lived signed link is issued by the download
         *     endpoint instead, the same way `vendor_attachments` issues them for a Customer's site photos.
         */
        StageEvidence: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["StageEvidenceKindEnum"];
            readonly note: string;
            readonly content_type: string;
            readonly size_bytes: number;
            readonly processing_status: components["schemas"]["RequirementScanStatusEnum"];
            readonly failure_reason: string;
            /** Format: date-time */
            readonly created_at: string;
        };
        StageEvidenceFinalizeRequest: {
            /** Format: uuid */
            upload_id: string;
        };
        /**
         * @description * `NOTE` - Written note
         *     * `PHOTO` - Photo
         *     * `VIDEO` - Video
         *     * `DOCUMENT` - Document
         * @enum {string}
         */
        StageEvidenceKindEnum: "NOTE" | "PHOTO" | "VIDEO" | "DOCUMENT";
        StageEvidenceSubmitRequest: {
            note: string;
        };
        StageEvidenceUploadGrant: {
            /** Format: uuid */
            readonly upload_id: string;
            /** Format: uri */
            readonly upload_url: string;
            readonly upload_token: string;
            /** Format: date-time */
            readonly expires_at: string;
        };
        StageEvidenceUploadRequestRequest: {
            kind: components["schemas"]["StageEvidenceKindEnum"];
            content_type: string;
            size_bytes: number;
            sha256: string;
        };
        /**
         * @description What the Customer is told about the code they must read out.
         *
         *     `code_length` rather than the code: the Customer reads the code off their own SMS, and
         *     publishing it here would hand it to anyone who could reach this endpoint — which is the
         *     whole point of the OTP. `development_code` is populated only by the development sender,
         *     exactly as OTP login already works.
         */
        StartOtp: {
            /** Format: uuid */
            booking_id: string;
            /** Format: date-time */
            expires_at: string;
            code_length: number;
            development_code?: string | null;
            /** Format: date-time */
            server_now: string;
        };
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        StartOtpVerifyRequestRequest: {
            expected_version: number;
            code: string;
        };
        StepUpSession: {
            /** Format: date-time */
            readonly stepped_up_at: string;
        };
        /**
         * @description * `SINGLE_PARTNER_SEQUENTIAL` - Single Partner sequential
         *     * `COORDINATED_PARALLEL` - Coordinated parallel
         *     * `INDEPENDENT_VISITS` - Independent visits
         *     * `MIXED` - Mixed
         * @enum {string}
         */
        StructureEnum: "SINGLE_PARTNER_SEQUENTIAL" | "COORDINATED_PARALLEL" | "INDEPENDENT_VISITS" | "MIXED";
        Subcategory: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly description: string;
        };
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        SubmitCompletionRequestRequest: {
            expected_version: number;
            /** @default  */
            notes: string;
            /** @default false */
            safety_damage_declared: boolean;
            outcomes: components["schemas"]["OutcomeInputRequest"][];
        };
        /**
         * @description * `UNDER_REVIEW` - UNDER_REVIEW
         *     * `CHANGES_REQUIRED` - CHANGES_REQUIRED
         *     * `APPROVED` - APPROVED
         *     * `SUSPENDED` - SUSPENDED
         *     * `OFFBOARDED` - OFFBOARDED
         * @enum {string}
         */
        TargetStatusEnum: "UNDER_REVIEW" | "CHANGES_REQUIRED" | "APPROVED" | "SUSPENDED" | "OFFBOARDED";
        TaxDocument: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["TaxDocumentKindEnum"];
            readonly number: string;
            readonly legal_entity_code: string;
            readonly financial_year: string;
            readonly is_test: boolean;
            /** Format: date-time */
            readonly issued_at: string | null;
            readonly total: components["schemas"]["Money"];
            readonly tax_snapshot: unknown;
            readonly lines: components["schemas"]["TaxDocumentLine"][];
        };
        /**
         * @description * `INVOICE` - Invoice
         *     * `CREDIT_NOTE` - Credit note
         * @enum {string}
         */
        TaxDocumentKindEnum: "INVOICE" | "CREDIT_NOTE";
        TaxDocumentLine: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly code: string;
            readonly label: string;
            readonly quantity: number;
            readonly total: components["schemas"]["Money"];
            readonly tax: components["schemas"]["Money"];
        };
        TeamQueue: {
            owner_team: components["schemas"]["OperationsCaseTeamEnum"];
            open: number;
            unclaimed: number;
        };
        /**
         * @description * `PAST` - PAST
         *     * `TOO_SOON` - TOO_SOON
         *     * `OUTSIDE_OPERATING_WINDOW` - OUTSIDE_OPERATING_WINDOW
         *     * `NO_CAPACITY` - NO_CAPACITY
         * @enum {string}
         */
        UnavailableReasonEnum: "PAST" | "TOO_SOON" | "OUTSIDE_OPERATING_WINDOW" | "NO_CAPACITY";
        UnitCancellationOutcome: {
            /** Format: uuid */
            fulfilment_unit_id: string;
            /** Format: uuid */
            booking_id: string;
            outcome: string;
            booking_status: string;
            fee_paise: number;
            refund_ids: string[];
        };
        UnitRescheduleOutcome: {
            /** Format: uuid */
            fulfilment_unit_id: string;
            /** Format: uuid */
            booking_id: string;
            /** Format: date-time */
            old_requested_start: string;
            /** Format: date-time */
            new_requested_start: string;
        };
        /** @description The A3 paywall as one read: what it costs, whether it can be bought, and whether it was. */
        UnlockState: {
            readonly unlock: components["schemas"]["QuoteUnlock"] | null;
            readonly is_available: boolean;
            readonly price_paise: number | null;
            readonly usable_quote_count: number;
            readonly can_read_full_quotes: boolean;
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description Partners owed money with no payable account. Reported, never silently skipped —
         *     a Partner left out of a run without explanation is a support ticket waiting to happen.
         */
        UnpayablePartner: {
            partner_ids: string[];
        };
        User: {
            /** Format: uuid */
            readonly id: string;
            readonly phone_number: string;
            readonly full_name: string;
            /** Format: email */
            readonly email: string;
            readonly roles: string[];
        };
        UserSession: {
            /** Format: uuid */
            readonly id: string;
            readonly device_label: string | null;
            readonly active_role: string | null;
            /** Format: date-time */
            readonly created_at: string;
            /** Format: date-time */
            readonly last_seen_at: string;
            /** Format: date-time */
            readonly expires_at: string;
            readonly is_current: boolean;
        };
        /**
         * @description One of the Customer's checked files, as a short-lived signed link.
         *
         *     `download_url` is a bearer credential — anyone holding it holds the file — which is why it is
         *     minted per read and expires in minutes rather than being stored anywhere.
         */
        VendorAttachment: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: string;
            readonly size_bytes: number;
            readonly language: string;
            /** Format: uri */
            readonly download_url: string;
            /** Format: date-time */
            readonly expires_at: string;
        };
        /**
         * @description Attachments this vendor may see, and whether they still may.
         *
         *     `has_access` is `false` once the invitation was declined, expired or withdrawn and this vendor
         *     was not selected. It is published as a state on a `200` rather than as an error because the
         *     vendor is entitled to their own enquiry record either way, and because "there are no
         *     photographs" and "you may no longer see the photographs" are different things to render.
         */
        VendorAttachmentList: {
            readonly has_access: boolean;
            readonly attachments: components["schemas"]["VendorAttachment"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description A responding vendor, as much of one as the Customer has paid to see.
         *
         *     An explicit field list for the same reason `QuoteTeaserSerializer` is one. Before a visit is
         *     confirmed this is a badge, a rating and a type — no name, no photo, no contact. After
         *     confirmation the name is disclosed, because a person is entering the Customer's home and must
         *     be nameable; contact stays masked until the engagement.
         */
        VendorCard: {
            /** Format: uuid */
            readonly partner_id: string;
            readonly vendor_type: string;
            readonly is_verified: boolean;
            readonly display_name: string | null;
            readonly distance_band_km: number | null;
        };
        /**
         * @description The A5 responding pool.
         *
         *     **No rating field, and that is a decision rather than an omission.** `README.md` lists a rating
         *     among the four pre-confirmation signals and this platform has no review model — `carts`'
         *     professional card already refuses to publish one for the same reason. A star count invented
         *     here would be this serializer deciding what a vendor's reputation is. The field arrives when a
         *     review aggregate does.
         */
        VendorCardList: {
            readonly vendor_cards: components["schemas"]["VendorCard"][];
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description * `INVITED` - Invited
         *     * `ACCEPTED` - Accepted
         *     * `QUOTED` - Quoted
         *     * `DECLINED` - Declined
         *     * `EXPIRED` - Expired
         *     * `WITHDRAWN` - Withdrawn
         * @enum {string}
         */
        VendorInvitationStatusEnum: "INVITED" | "ACCEPTED" | "QUOTED" | "DECLINED" | "EXPIRED" | "WITHDRAWN";
        VersionedBatchCommandRequest: {
            expected_version: number;
        };
        VersionedCaseCommandRequest: {
            expected_version: number;
        };
        /**
         * @description The floor every state-changing fulfilment command sits on.
         *
         *     `expected_version` is required, never defaulted. A command that would apply to whatever
         *     state it happens to find is the thing optimistic concurrency exists to prevent, and a
         *     default here would silently reintroduce it for every caller that forgot the field.
         */
        VersionedCommandRequest: {
            expected_version: number;
        };
        /**
         * @description * `NON_OTP_FALLBACK` - Confirmed without an OTP
         *     * `START_OTP` - Confirmed with a start OTP
         * @enum {string}
         */
        VisitArrivalMethodEnum: "NON_OTP_FALLBACK" | "START_OTP";
        /**
         * @description * `VENDOR` - Vendor
         *     * `CUSTOMER` - Customer
         * @enum {string}
         */
        VisitNoShowPartyEnum: "VENDOR" | "CUSTOMER";
        /**
         * @description * `NOBODY_ON_SITE` - Nobody was at the address
         *     * `SITE_INACCESSIBLE` - Could not get access to the site
         *     * `ADDRESS_WRONG` - The address was wrong or could not be found
         *     * `VENDOR_DID_NOT_ARRIVE` - The professional never arrived
         *     * `CANCELLED_ON_THE_DAY` - The other party cancelled on the day
         *     * `OTHER` - Another reason
         * @enum {string}
         */
        VisitNoShowReasonEnum: "NOBODY_ON_SITE" | "SITE_INACCESSIBLE" | "ADDRESS_WRONG" | "VENDOR_DID_NOT_ARRIVE" | "CANCELLED_ON_THE_DAY" | "OTHER";
        /**
         * @description Report that a scheduled visit did not happen.
         *
         *     `party` decides the settlement and `reason_code` decides nothing — see `VISIT_NO_SHOW_REASONS`.
         *     The reason is still required, because "nobody turned up" without a cause is a row Operations
         *     cannot act on and a vendor cannot appeal.
         */
        VisitNoShowRequest: {
            party: components["schemas"]["VisitNoShowPartyEnum"];
            reason_code: components["schemas"]["VisitNoShowReasonEnum"];
        };
        VisitPlan: {
            /** Format: uuid */
            readonly id: string;
            readonly status: components["schemas"]["VisitPlanStatusEnum"];
            readonly plan_size: number;
            readonly price_paise: number;
            readonly credit_paise: number;
            /** @description What the Customer still owes: the tier price less any carried-over unlock credit. */
            readonly chargeable_paise: number;
            readonly shares: components["schemas"]["VisitPlanShare"][];
            readonly receipt_series: string;
            readonly receipt_sequence: number | null;
            /** Format: date-time */
            readonly fill_due_at: string | null;
            /** Format: date-time */
            readonly chosen_at: string;
            /** Format: date-time */
            readonly charged_at: string | null;
            /** Format: date-time */
            readonly settled_at: string | null;
        };
        VisitPlanChooseRequest: {
            plan_size: number;
        };
        /**
         * @description One slot of the plan and the money that follows it.
         *
         *     The split is published because the Customer is entitled to know what their money bought: a
         *     vendor visit payout and a Vsolve platform share, in paise, per slot. `REFUNDED` returns both.
         */
        VisitPlanShare: {
            /** Format: uuid */
            readonly id: string;
            readonly position: number;
            readonly status: components["schemas"]["VisitPlanShareStatusEnum"];
            readonly amount_paise: number;
            readonly vendor_payout_paise: number;
            readonly platform_share_paise: number;
            readonly settlement_reason_code: string;
            /** Format: date-time */
            readonly committed_at: string | null;
            /** Format: date-time */
            readonly earned_at: string | null;
            /** Format: date-time */
            readonly refunded_at: string | null;
        };
        /**
         * @description * `OPEN` - Open
         *     * `COMMITTED` - A vendor confirmed a visit
         *     * `EARNED` - Visit completed and estimate delivered
         *     * `REFUNDED` - Refunded to the Customer
         *     * `REPLACED` - Awaiting a free replacement visit
         * @enum {string}
         */
        VisitPlanShareStatusEnum: "OPEN" | "COMMITTED" | "EARNED" | "REFUNDED" | "REPLACED";
        /**
         * @description The A5 front door as one read: the chooser before, the tracker after.
         *
         *     Deliberately one endpoint for both. Before a plan exists it carries the priced tiers the review
         *     screen offers; after one exists it carries the plan, its shares and the confirmed visits with
         *     their times. Two endpoints would have meant the tracker and the chooser could disagree about
         *     which plan the Customer has.
         */
        VisitPlanState: {
            readonly plan: components["schemas"]["VisitPlan"] | null;
            readonly available_tiers: components["schemas"]["VisitPlanTier"][];
            readonly visits: components["schemas"]["SiteVisit"][];
            readonly checkout_available: boolean;
            readonly can_read_full_estimates: boolean;
            /** Format: date-time */
            readonly server_now: string;
        };
        /**
         * @description * `CHOSEN` - Chosen, nothing charged
         *     * `PENDING` - Awaiting the provider
         *     * `ACTIVE` - Charged
         *     * `FAILED` - Payment failed
         *     * `VOID` - Closed before any visit was confirmed
         *     * `SETTLED` - Every share earned or refunded
         * @enum {string}
         */
        VisitPlanStatusEnum: "CHOSEN" | "PENDING" | "ACTIVE" | "FAILED" | "VOID" | "SETTLED";
        /** @description One row of the review screen's chooser. An empty list is the honest unpriced state. */
        VisitPlanTier: {
            readonly plan_size: number;
            readonly price_paise: number;
        };
        /**
         * @description One candidate start, in `booking/windows/` field order and with one field removed.
         *
         *     `capacity` is deliberately absent. The A1 grid publishes it to a Customer choosing between
         *     Partners; this grid is scoped to the **one invited vendor**, so a capacity number here would be
         *     a live readout of that vendor's own diary depth and nothing a slot picker needs.
         */
        VisitSlot: {
            readonly id: string;
            /** Format: date-time */
            readonly starts_at: string;
            /** Format: date-time */
            readonly ends_at: string;
            readonly is_available: boolean;
            readonly unavailable_reason: (components["schemas"]["UnavailableReasonEnum"] | components["schemas"]["NullEnum"]) | null;
        };
        VisitSlotConfirmRequest: {
            slot_id: string;
        };
        VisitSlotConfirmation: {
            readonly visit: components["schemas"]["SiteVisit"];
            readonly share: components["schemas"]["VisitPlanShare"];
            readonly opens_plan_checkout: boolean;
            /** Format: date-time */
            readonly server_now: string;
        };
        VisitSlotDay: {
            /** Format: date */
            readonly date: string;
            readonly is_today: boolean;
            readonly slots: components["schemas"]["VisitSlot"][];
        };
        /**
         * @description Candidate visit starts for one invited vendor.
         *
         *     The Partner-side twin of `POST /api/v1/booking/windows/`, drawn from the same
         *     `carts.availability` snapshot and the same window loop. **The browser never computes
         *     availability** — it renders these slots and posts back an `id`, which is a signed token bound
         *     to this invitation and this start.
         */
        VisitSlotGrid: {
            /** Format: date-time */
            readonly server_now: string;
            readonly visit_duration_minutes: number;
            readonly availability_is_preliminary: boolean;
            readonly timezone: string;
            readonly days: components["schemas"]["VisitSlotDay"][];
        };
        WebhookAccepted: {
            readonly accepted: boolean;
            readonly duplicate: boolean;
        };
        /**
         * @description Evidence metadata only.
         *
         *     The object key is a private-bucket path and the bytes are KYC-adjacent: neither belongs in
         *     a list projection. A reader who needs the file asks for a fresh, audited, expiring grant,
         *     the same way Partner documents work.
         */
        WorkEvidence: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["WorkEvidenceKindEnum"];
            /** Format: uuid */
            readonly work_task_id: string | null;
            readonly content_type: string;
            readonly size_bytes: number;
            readonly processing_status: components["schemas"]["ProcessingStatusEnum"];
            /** Format: date-time */
            readonly created_at: string;
        };
        /**
         * @description * `BEFORE` - Before
         *     * `AFTER` - After
         *     * `CONTACT_ATTEMPT` - Contact attempt
         *     * `SAFETY` - Safety
         *     * `DAMAGE` - Damage
         *     * `AMENDMENT` - Amendment
         *     * `COMPLETION` - Completion
         *     * `WAIT` - Wait
         * @enum {string}
         */
        WorkEvidenceKindEnum: "BEFORE" | "AFTER" | "CONTACT_ATTEMPT" | "SAFETY" | "DAMAGE" | "AMENDMENT" | "COMPLETION" | "WAIT";
        WorkOutcome: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly work_task_id: string;
            readonly outcome: components["schemas"]["WorkOutcomeEnum"];
            readonly quantity: number;
            readonly reason: string;
        };
        /**
         * @description * `COMPLETED` - Completed
         *     * `PARTIAL` - Partial
         *     * `NOT_STARTED` - Not started
         *     * `BLOCKED` - Blocked
         *     * `NOT_APPLICABLE` - Not applicable
         * @enum {string}
         */
        WorkOutcomeEnum: "COMPLETED" | "PARTIAL" | "NOT_STARTED" | "BLOCKED" | "NOT_APPLICABLE";
        WorkTask: {
            /** Format: uuid */
            readonly id: string;
            readonly kind: components["schemas"]["WorkTaskKindEnum"];
            readonly position: number;
            readonly code: string;
            readonly label: string;
            readonly quantity: number;
            readonly amount_paise: number;
            readonly currency: string;
        };
        /**
         * @description * `ORIGINAL` - Original scope
         *     * `AMENDMENT` - Approved amendment
         * @enum {string}
         */
        WorkTaskKindEnum: "ORIGINAL" | "AMENDMENT";
        /**
         * @description `{workspace_key, commercial_mode, actions[]}` and nothing else.
         *
         *     No routes, no labels, no icons: the backend authorises, the frontend owns presentation. The
         *     key is opaque — a client that does not recognise one renders nothing rather than a generic
         *     tab, because a tab whose screens are not in the bundle is an unrecoverable dead end.
         */
        WorkspaceGrant: {
            readonly workspace_key: components["schemas"]["WorkspaceKeyEnum"];
            readonly commercial_mode: string;
            readonly actions: string[];
        };
        WorkspaceGrantList: {
            readonly workspaces: components["schemas"]["WorkspaceGrant"][];
        };
        /**
         * @description * `LEGACY` - Legacy
         *     * `A1_TASK_VISIT` - A1 task visit
         *     * `A3_TIME_BLOCK` - A3 time block
         *     * `A5_CUSTOM_PROJECT` - A5 custom project
         * @enum {string}
         */
        WorkspaceKeyEnum: "LEGACY" | "A1_TASK_VISIT" | "A3_TIME_BLOCK" | "A5_CUSTOM_PROJECT";
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    addresses_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"][];
                };
            };
        };
    };
    addresses_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddressRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["AddressRequest"];
                "multipart/form-data": components["schemas"]["AddressRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    addresses_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                address_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    addresses_destroy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                address_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Address archived. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    addresses_partial_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                address_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedAddressRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedAddressRequest"];
                "multipart/form-data": components["schemas"]["PatchedAddressRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Address"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    auth_csrf_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CsrfToken"];
                };
            };
        };
    };
    auth_finance_step_up_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OtpVerifyRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OtpVerifyRequest"];
                "multipart/form-data": components["schemas"]["OtpVerifyRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StepUpSession"];
                };
            };
        };
    };
    auth_logout_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The current session was revoked. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    auth_otp_request_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OtpRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OtpRequestRequest"];
                "multipart/form-data": components["schemas"]["OtpRequestRequest"];
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OtpIssued"];
                };
            };
            /** @description `intended_role` was set and this number holds no such account. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    auth_otp_verify_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OtpVerifyRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OtpVerifyRequest"];
                "multipart/form-data": components["schemas"]["OtpVerifyRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthenticatedSession"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    auth_privacy_consents_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsentReceiptCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ConsentReceiptCreateRequest"];
                "multipart/form-data": components["schemas"]["ConsentReceiptCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentReceipt"];
                };
            };
        };
    };
    auth_privacy_preferences_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CommunicationPreference"][];
                };
            };
        };
    };
    auth_privacy_preferences_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommunicationPreferenceRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CommunicationPreferenceRequest"];
                "multipart/form-data": components["schemas"]["CommunicationPreferenceRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CommunicationPreference"];
                };
            };
        };
    };
    auth_privacy_requests_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivacyRequest"][];
                };
            };
        };
    };
    auth_privacy_requests_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrivacyRequestCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PrivacyRequestCreateRequest"];
                "multipart/form-data": components["schemas"]["PrivacyRequestCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrivacyRequest"];
                };
            };
        };
    };
    auth_roles_switch_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RoleSwitchRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RoleSwitchRequest"];
                "multipart/form-data": components["schemas"]["RoleSwitchRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ActiveRole"];
                };
            };
        };
    };
    auth_session_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionState"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    auth_sessions_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserSession"][];
                };
            };
        };
    };
    auth_sessions_destroy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The selected session was revoked. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    booking_group_list: {
        parameters: {
            query?: {
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingGroupPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_group_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingGroup"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booked_group_change_address: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupAddressChangeRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["GroupAddressChangeRequestRequest"];
                "multipart/form-data": components["schemas"]["GroupAddressChangeRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupRescheduleResult"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_group_cancel: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BookingGroupCancelRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["BookingGroupCancelRequest"];
                "multipart/form-data": components["schemas"]["BookingGroupCancelRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingGroup"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booked_group_cancel: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupCancelRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["GroupCancelRequestRequest"];
                "multipart/form-data": components["schemas"]["GroupCancelRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupCancellationResult"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booked_group_reschedule: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupRescheduleRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["GroupRescheduleRequestRequest"];
                "multipart/form-data": components["schemas"]["GroupRescheduleRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupRescheduleResult"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_windows_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BookingWindowsRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["BookingWindowsRequestRequest"];
                "multipart/form-data": components["schemas"]["BookingWindowsRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingWindows"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBooking"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_cancel: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReasonedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ReasonedCommandRequest"];
                "multipart/form-data": components["schemas"]["ReasonedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingCancellationResult"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_completion_confirm: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_completion_dispute: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DisputeCompletionRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["DisputeCompletionRequestRequest"];
                "multipart/form-data": components["schemas"]["DisputeCompletionRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_quality_dispute: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReasonedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ReasonedCommandRequest"];
                "multipart/form-data": components["schemas"]["ReasonedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_reschedule: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RescheduleBookingRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RescheduleBookingRequestRequest"];
                "multipart/form-data": components["schemas"]["RescheduleBookingRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_reschedule_windows: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BookingWindows"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    booking_start_otp_request: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StartOtp"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
        };
    };
    cart_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CartItemInputRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CartItemInputRequest"];
                "multipart/form-data": components["schemas"]["CartItemInputRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartItem"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_items_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CartItemCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CartItemCreateRequest"];
                "multipart/form-data": components["schemas"]["CartItemCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_items_destroy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_items_partial_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedCartItemUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedCartItemUpdateRequest"];
                "multipart/form-data": components["schemas"]["PatchedCartItemUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_items_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                item_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CartItemRemoveRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CartItemRemoveRequest"];
                "multipart/form-data": components["schemas"]["CartItemRemoveRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_merge_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CartMergeRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CartMergeRequest"];
                "multipart/form-data": components["schemas"]["CartMergeRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cart"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_scheduling_groups_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SchedulingGroupsRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SchedulingGroupsRequestRequest"];
                "multipart/form-data": components["schemas"]["SchedulingGroupsRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SchedulingGroups"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    cart_suggestions_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartSuggestions"];
                };
            };
        };
    };
    categories_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Category"][];
                };
            };
        };
    };
    categories_services_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceCard"][];
                };
            };
        };
    };
    checkouts_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CheckoutCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CheckoutCreateRequest"];
                "multipart/form-data": components["schemas"]["CheckoutCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Checkout"];
                };
            };
        };
    };
    checkouts_payment_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                checkout_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentAttempt"];
                };
            };
        };
    };
    checkouts_search_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                checkout_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Offer"];
                };
            };
        };
    };
    checkouts_search_advance_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                checkout_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Offer"];
                };
            };
        };
    };
    m2_engagement_amendment_decide: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                engagement_amendment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementAmendmentDecision"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_amendment_not_actionable` when it expired or already has a decision. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_amendment_decline: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                engagement_amendment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementAmendmentDecision"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_approve: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_stage_disputed` while a dispute is open; `m2_stage_transition_not_allowed` when nothing has been submitted. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_request_correction: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageCorrectionRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StageCorrectionRequest"];
                "multipart/form-data": components["schemas"]["StageCorrectionRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_dispute: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageDisputeRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StageDisputeRequest"];
                "multipart/form-data": components["schemas"]["StageDisputeRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_dispute_resolve: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageDisputeDecisionRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StageDisputeDecisionRequest"];
                "multipart/form-data": components["schemas"]["StageDisputeDecisionRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_evidence_finalize: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageEvidenceFinalizeRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StageEvidenceFinalizeRequest"];
                "multipart/form-data": components["schemas"]["StageEvidenceFinalizeRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StageEvidence"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_evidence_upload_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageEvidenceUploadRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StageEvidenceUploadRequestRequest"];
                "multipart/form-data": components["schemas"]["StageEvidenceUploadRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StageEvidenceUploadGrant"];
                };
            };
            /** @description `m2_attachment_invalid` for an unsupported media type, an empty file, a file over the per-kind ceiling or a malformed checksum. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_stage_transition_not_allowed` once the stage no longer accepts evidence. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_attachment_unavailable` when storage is down. Retryable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_funding_checkout_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessCheckout"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_stage_not_funded` when the stage is already funded, when an earlier stage is not, or when the engagement is `LEAD_ONLY` and paid directly to the vendor. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_start: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_stage_not_funded` on an unfunded A5 stage; `m2_stage_transition_not_allowed` from any other status, or before work has been cleared to start. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_stage_evidence_submit: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                stage_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StageEvidenceSubmitRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StageEvidenceSubmitRequest"];
                "multipart/form-data": components["schemas"]["StageEvidenceSubmitRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementStage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_list: {
        parameters: {
            query?: {
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                engagement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Engagement"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_amendment_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                engagement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementAmendmentList"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_amendment_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                engagement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EngagementAmendmentCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["EngagementAmendmentCreateRequest"];
                "multipart/form-data": components["schemas"]["EngagementAmendmentCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementAmendment"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_amendment_not_actionable` when one is already open; `m2_stage_transition_not_allowed` for the wrong kind, an engagement that is not open to changes, or a reduction that is too large or too late; `m2_amendment_required` when the engagement carries no agreed daily rate to price an extension from; `m2_policy_unavailable` when the response window is unset — an amendment with no deadline is an open-ended claim on somebody's money, so it is refused rather than invented. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_completion_accept: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                engagement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Engagement"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_stage_transition_not_allowed` when stages are still open. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_engagement_event_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                engagement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngagementEventList"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    finance_refunds_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefundCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RefundCreateRequest"];
                "multipart/form-data": components["schemas"]["RefundCreateRequest"];
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Refund"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    finance_refunds_reconcile_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                refund_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Refund"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    fulfilment_plan_sets_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["FulfilmentPlanSetCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["FulfilmentPlanSetCreateRequest"];
                "multipart/form-data": components["schemas"]["FulfilmentPlanSetCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FulfilmentPlanSet"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    fulfilment_plan_sets_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                plan_set_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FulfilmentPlanSet"];
                };
            };
        };
    };
    geocoding_reverse_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReverseGeocodeRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ReverseGeocodeRequestRequest"];
                "multipart/form-data": components["schemas"]["ReverseGeocodeRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReverseGeocodeResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    health_live_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The API process is running. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    health_ready_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Required dependencies are reachable. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description One or more required dependencies are unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    operations_assisted_checkouts_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssistedCheckoutCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["AssistedCheckoutCreateRequest"];
                "multipart/form-data": components["schemas"]["AssistedCheckoutCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Checkout"];
                };
            };
        };
    };
    operations_booking_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsBooking"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_booking_assisted_start: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssistedStartRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["AssistedStartRequestRequest"];
                "multipart/form-data": components["schemas"]["AssistedStartRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_booking_recover_partner: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecoverBookingRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RecoverBookingRequestRequest"];
                "multipart/form-data": components["schemas"]["RecoverBookingRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_cases_list: {
        parameters: {
            query?: {
                /** @description Opaque page cursor. */
                cursor?: string;
                /** @description Filter by case kind. */
                kind?: string;
                /** @description Only cases past their SLA deadline. */
                overdue?: boolean;
                /** @description `me` for cases the caller has claimed, `unclaimed` for cases no one has. Resolved against the session, never a caller-supplied id. */
                owner?: string;
                /** @description Filter by owning team. */
                owner_team?: string;
                /** @description Filter by case status. */
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCasePage"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_cases_open: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OpenCaseRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OpenCaseRequestRequest"];
                "multipart/form-data": components["schemas"]["OpenCaseRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCase"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_case_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCase"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_case_claim: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedCaseCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedCaseCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedCaseCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCase"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_case_escalate: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EscalateCaseRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["EscalateCaseRequestRequest"];
                "multipart/form-data": components["schemas"]["EscalateCaseRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCase"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_case_add_note: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaseNoteRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CaseNoteRequestRequest"];
                "multipart/form-data": components["schemas"]["CaseNoteRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCase"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_case_resolve: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                case_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResolveCaseRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ResolveCaseRequestRequest"];
                "multipart/form-data": components["schemas"]["ResolveCaseRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsCase"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_cases_summary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CaseQueueSummary"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_checkouts_offers_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                checkout_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualOfferRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ManualOfferRequest"];
                "multipart/form-data": components["schemas"]["ManualOfferRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Offer"];
                };
            };
        };
    };
    operations_compatibility_rule_list: {
        parameters: {
            query?: {
                /**
                 * @description * `DRAFT` - Draft
                 *     * `ACTIVE` - Active
                 *     * `RETIRED` - Retired
                 *     * `REJECTED` - Rejected
                 */
                lifecycle_status?: "DRAFT" | "ACTIVE" | "RETIRED" | "REJECTED";
                variant_id?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompatibilityRulePage"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_compatibility_rule_create_draft: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompatibilityRuleDraftRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CompatibilityRuleDraftRequest"];
                "multipart/form-data": components["schemas"]["CompatibilityRuleDraftRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompatibilityRule"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_compatibility_rule_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompatibilityRule"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_compatibility_rule_activate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompatibilityRuleReviewRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CompatibilityRuleReviewRequest"];
                "multipart/form-data": components["schemas"]["CompatibilityRuleReviewRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompatibilityRule"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_compatibility_rule_reject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompatibilityRuleReviewRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CompatibilityRuleReviewRequest"];
                "multipart/form-data": components["schemas"]["CompatibilityRuleReviewRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompatibilityRule"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_compatibility_rule_retire: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CompatibilityRuleRetireRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CompatibilityRuleRetireRequest"];
                "multipart/form-data": components["schemas"]["CompatibilityRuleRetireRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CompatibilityRule"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_fulfilment_unit_dispatch_explanation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                unit_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DispatchExplanation"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_fulfilment_unit_offer_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                unit_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualOfferRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ManualOfferRequest"];
                "multipart/form-data": components["schemas"]["ManualOfferRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Offer"];
                };
            };
        };
    };
    operations_fulfilment_unit_recover: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                unit_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DispatchCommandRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["DispatchCommandRequestRequest"];
                "multipart/form-data": components["schemas"]["DispatchCommandRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FulfilmentUnitDispatch"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_kill_switches_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KillSwitch"][];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_kill_switch_engage: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EngageKillSwitchRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["EngageKillSwitchRequestRequest"];
                "multipart/form-data": components["schemas"]["EngageKillSwitchRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KillSwitch"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_kill_switch_release: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReleaseKillSwitchRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ReleaseKillSwitchRequestRequest"];
                "multipart/form-data": components["schemas"]["ReleaseKillSwitchRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KillSwitch"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_ledger_adjust: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LedgerAdjustmentRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["LedgerAdjustmentRequestRequest"];
                "multipart/form-data": components["schemas"]["LedgerAdjustmentRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerLedgerEntry"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_offer_revoke: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                offer_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DispatchCommandRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["DispatchCommandRequestRequest"];
                "multipart/form-data": components["schemas"]["DispatchCommandRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Offer"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_application_queue_list: {
        parameters: {
            query?: {
                assigned_to_me?: boolean;
                cursor?: string;
                /**
                 * @description * `SUBMITTED` - SUBMITTED
                 *     * `UNDER_REVIEW` - UNDER_REVIEW
                 *     * `CHANGES_REQUIRED` - CHANGES_REQUIRED
                 */
                status?: "SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUIRED";
                unassigned?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsApplicationQueuePage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_application_detail_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                application_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_applications_claim_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                application_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExpectedVersionRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ExpectedVersionRequest"];
                "multipart/form-data": components["schemas"]["ExpectedVersionRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_applications_transition_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                application_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OperationsTransitionRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OperationsTransitionRequest"];
                "multipart/form-data": components["schemas"]["OperationsTransitionRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_documents_access_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerDocumentReviewAccess"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_documents_review_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OperationsDocumentReviewRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OperationsDocumentReviewRequest"];
                "multipart/form-data": components["schemas"]["OperationsDocumentReviewRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerDocument"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_directory_list: {
        parameters: {
            query?: {
                /** @description Opaque page cursor. */
                cursor?: string;
                /** @description Repeatable skill code. A Partner matching *any* supplied skill is listed — a directory multi-select reads as a union. */
                skill?: string[];
                /** @description Filter by application status. */
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsPartnerDirectoryPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partner_detail_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                partner_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OperationsPartnerDetail"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_partners_availability_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                partner_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OperationsPartnerScheduleUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["OperationsPartnerScheduleUpdateRequest"];
                "multipart/form-data": components["schemas"]["OperationsPartnerScheduleUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerSchedule"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_payout_batches_list: {
        parameters: {
            query?: {
                /** @description Opaque page cursor. */
                cursor?: string;
                /** @description Filter by batch status. */
                status?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutBatchPage"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_payout_batch_propose: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProposePayoutBatchRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ProposePayoutBatchRequestRequest"];
                "multipart/form-data": components["schemas"]["ProposePayoutBatchRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutBatch"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_payout_batch_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                batch_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutBatch"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_payout_batch_approve: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                batch_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedBatchCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedBatchCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedBatchCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutBatch"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_payout_batch_cancel: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                batch_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedBatchCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedBatchCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedBatchCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutBatch"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_payout_batch_pay: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                batch_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedBatchCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedBatchCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedBatchCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PayoutBatch"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_reservation_release: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                reservation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DispatchCommandRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["DispatchCommandRequestRequest"];
                "multipart/form-data": components["schemas"]["DispatchCommandRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DispatchReservation"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    operations_unpayable_partners: {
        parameters: {
            query: {
                period_end: string;
                period_start: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnpayablePartner"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    orders_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                order_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
        };
    };
    partner_application_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_application_partial_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedPartnerApplicationUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedPartnerApplicationUpdateRequest"];
                "multipart/form-data": components["schemas"]["PatchedPartnerApplicationUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_application_documents_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerDocumentFinalizeRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerDocumentFinalizeRequest"];
                "multipart/form-data": components["schemas"]["PartnerDocumentFinalizeRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerDocument"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_application_documents_uploads_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerDocumentUploadRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerDocumentUploadRequestRequest"];
                "multipart/form-data": components["schemas"]["PartnerDocumentUploadRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerDocumentUpload"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_application_submit_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExpectedVersionRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ExpectedVersionRequest"];
                "multipart/form-data": components["schemas"]["ExpectedVersionRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerApplication"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_availability_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerSchedule"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_availability_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerScheduleUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerScheduleUpdateRequest"];
                "multipart/form-data": components["schemas"]["PartnerScheduleUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerSchedule"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_list: {
        parameters: {
            query?: {
                /**
                 * @description * `active` - active
                 *     * `completed` - completed
                 *     * `cancelled` - cancelled
                 */
                bucket?: "active" | "completed" | "cancelled";
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBookingPage"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_abort: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReasonedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ReasonedCommandRequest"];
                "multipart/form-data": components["schemas"]["ReasonedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_arrived: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_submit_completion: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitCompletionRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SubmitCompletionRequestRequest"];
                "multipart/form-data": components["schemas"]["SubmitCompletionRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_contact_attempt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CustomerContactAttemptRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CustomerContactAttemptRequestRequest"];
                "multipart/form-data": components["schemas"]["CustomerContactAttemptRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_customer_unavailable: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_en_route: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VersionedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VersionedCommandRequest"];
                "multipart/form-data": components["schemas"]["VersionedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_evidence_finalize: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EvidenceFinalizeRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["EvidenceFinalizeRequestRequest"];
                "multipart/form-data": components["schemas"]["EvidenceFinalizeRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkEvidence"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_evidence_upload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EvidenceUploadRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["EvidenceUploadRequestRequest"];
                "multipart/form-data": components["schemas"]["EvidenceUploadRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EvidenceUploadGrant"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_release: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReasonedCommandRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ReasonedCommandRequest"];
                "multipart/form-data": components["schemas"]["ReasonedCommandRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_propose_amendment: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProposeAmendmentRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ProposeAmendmentRequestRequest"];
                "multipart/form-data": components["schemas"]["ProposeAmendmentRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_booking_start_otp_verify: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                booking_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StartOtpVerifyRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["StartOtpVerifyRequestRequest"];
                "multipart/form-data": components["schemas"]["StartOtpVerifyRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBooking"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_business_profile_read: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBusinessProfile"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_business_profile_replace: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerBusinessProfileWriteRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerBusinessProfileWriteRequest"];
                "multipart/form-data": components["schemas"]["PartnerBusinessProfileWriteRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBusinessProfile"];
                };
            };
            /** @description `m2_business_type_invalid` for a registration number on an `INDIVIDUAL`, or a GSTIN without `gst_registered`. Both are model constraints. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_capability_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerCapabilityList"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_capability_request: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CapabilityRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CapabilityRequestRequest"];
                "multipart/form-data": components["schemas"]["CapabilityRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerCapability"];
                };
            };
            /** @description `m2_lifecycle_not_supported` when the variant carries no A3/A5 archetype. Show "we do not cover this yet" and return to the options list, not a field error. `m2_business_type_invalid` when the registration answers do not satisfy the variant's published question schema, or when a requested service area is not one the Partner works in — the capability can only narrow their coverage, never add to it. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_capability_already_requested` when a live request exists for this variant — the recovery is "open the one you have", not "try something else". `idempotency_in_progress` means wait and re-read, never resend under a new key. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_capability_submit: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                capability_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["CapabilitySubmitRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CapabilitySubmitRequest"];
                "multipart/form-data": components["schemas"]["CapabilitySubmitRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerCapability"];
                };
            };
            /** @description `m2_business_type_invalid` when the registration answers do not satisfy the variant's published question schema. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_capability_transition_not_allowed` from any status other than `REQUESTED` or `CHANGES_REQUIRED`. A capability already `UNDER_REVIEW` returns `200` unchanged rather than refusing — resubmitting is not an error. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_capability_withdraw: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                capability_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerCapability"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_capability_option_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CapabilityOptions"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_crew_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrewList"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_crew_add: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrewMemberCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CrewMemberCreateRequest"];
                "multipart/form-data": components["schemas"]["CrewMemberCreateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrewMember"];
                };
            };
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrewMember"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_capability_not_approved` when the Partner holds no approved workforce capability. The roster is not a general address book. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_crew_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                membership_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedCrewMemberUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedCrewMemberUpdateRequest"];
                "multipart/form-data": components["schemas"]["PatchedCrewMemberUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrewMember"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_crew_archive: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                membership_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrewMember"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_crew_availability_set: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                membership_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrewAvailabilityWriteRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["CrewAvailabilityWriteRequest"];
                "multipart/form-data": components["schemas"]["CrewAvailabilityWriteRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CrewAvailability"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_demand_preview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DemandPreview"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_earnings_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerBalance"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_enquiry_list: {
        parameters: {
            query?: {
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnquirySummaryPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_enquiry_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnquiryDetail"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_enquiry_accept: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnquiryDetail"];
                };
            };
            /** @description `m2_kyc_required` — identity verification is gated here, at the first accept, rather than at registration. `m2_capability_not_approved` and `m2_capability_suspended` when the lifecycle capability is not live. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_invitation_expired`, `m2_invitation_slots_exhausted`, `m2_proposal_slot_conflict` when a linked account already holds a slot, or `m2_capacity_unavailable` when the vendor already has work booked on these dates — either another M2 enquiry they accepted or an A1 booking on the shared availability grid. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_enquiry_attachment_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VendorAttachmentList"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_attachment_unavailable` when the storage adapter is down. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_enquiry_decline: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EnquiryDeclineRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["EnquiryDeclineRequest"];
                "multipart/form-data": components["schemas"]["EnquiryDeclineRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnquiryDetail"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_enquiry_question_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuestionCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["QuestionCreateRequest"];
                "multipart/form-data": components["schemas"]["QuestionCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementQuestion"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_site_visit_request: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SiteVisitRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SiteVisitRequestRequest"];
                "multipart/form-data": components["schemas"]["SiteVisitRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SiteVisit"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_visit_slot_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VisitSlotGrid"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_policy_unavailable` when the owner has not set how long a visit takes for this service — the grid cannot be drawn at an invented width; `m2_visit_slot_unavailable` when the request has no serviceable area. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_visit_slot_confirm: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                invitation_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VisitSlotConfirmRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VisitSlotConfirmRequest"];
                "multipart/form-data": components["schemas"]["VisitSlotConfirmRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VisitSlotConfirmation"];
                };
            };
            /** @description `m2_lifecycle_not_supported` — only project requests book visit slots. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_visit_slot_unavailable` when the slot has gone, the token is stale or the start has passed — the availability grid's exclusion constraint is the final authority and this is what losing that race reads as; `m2_visit_plan_required` when no plan is live; `m2_capacity_unavailable` and `m2_invitation_slots_exhausted` from the acceptance underneath. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_gate_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgressiveGateList"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_insurance_read: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerInsurance"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_insurance_replace: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerInsuranceWriteRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerInsuranceWriteRequest"];
                "multipart/form-data": components["schemas"]["PartnerInsuranceWriteRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerInsurance"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_language_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerLanguageList"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_language_set: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerLanguageWriteRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerLanguageWriteRequest"];
                "multipart/form-data": components["schemas"]["PartnerLanguageWriteRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerLanguageList"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_ledger_list: {
        parameters: {
            query?: {
                /** @description Opaque page cursor. */
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerLedgerPage"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_me_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerProfile"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_me_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedPartnerProfileUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedPartnerProfileUpdateRequest"];
                "multipart/form-data": components["schemas"]["PatchedPartnerProfileUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerProfile"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_offer_list: {
        parameters: {
            query?: {
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OfferPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_offers_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                /** @description The Partner offer command to run. The set is closed, so an unknown action is a client bug caught by the generated type rather than a runtime refusal shown to a Partner. */
                action: components["schemas"]["OfferActionEnum"];
                offer_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Offer"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_offer_stream: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A `text/event-stream` of `offer_created` events. Each event's `data` is the notification context documented in contracts/proposals/partner-offer-events.md: `offer_id`, `fulfilment_unit_id`, `requested_start`, `expires_at`. Comment lines are keepalives. The server closes the connection after M1_OFFER_STREAM_MAX_SECONDS and the client reconnects. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    partner_payout_account_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerPayoutAccount"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_performance_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerPerformance"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_presence_heartbeat_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerPresenceHeartbeatRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerPresenceHeartbeatRequest"];
                "multipart/form-data": components["schemas"]["PartnerPresenceHeartbeatRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerPresence"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_presence_offline_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerPresenceSessionRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerPresenceSessionRequestRequest"];
                "multipart/form-data": components["schemas"]["PartnerPresenceSessionRequestRequest"];
            };
        };
        responses: {
            /** @description The Partner is offline. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_presence_online_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PartnerGoOnlineRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerGoOnlineRequest"];
                "multipart/form-data": components["schemas"]["PartnerGoOnlineRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerPresence"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_partner_question_answer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                question_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuestionAnswerRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["QuestionAnswerRequest"];
                "multipart/form-data": components["schemas"]["QuestionAnswerRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementQuestion"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    partner_required_consents_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerConsentDocument"][];
                };
            };
        };
    };
    partner_skills_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerSkillOption"][];
                };
            };
        };
    };
    m2_partner_workspace_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkspaceGrantList"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    payment_attempts_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentAttemptCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PaymentAttemptCreateRequest"];
                "multipart/form-data": components["schemas"]["PaymentAttemptCreateRequest"];
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentAttempt"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    payment_attempts_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                attempt_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentAttempt"];
                };
            };
        };
    };
    payment_attempts_reconcile_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                attempt_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentAttempt"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    payment_attempt_simulate_capture: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                attempt_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentAttempt"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    payment_webhooks_razorpay_create: {
        parameters: {
            query?: never;
            header: {
                "X-Razorpay-Event-Id": string;
                "X-Razorpay-Signature": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
                "application/x-www-form-urlencoded": {
                    [key: string]: unknown;
                };
                "multipart/form-data": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookAccepted"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    plan_quotes_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlanQuoteCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PlanQuoteCreateRequest"];
                "multipart/form-data": components["schemas"]["PlanQuoteCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupQuote"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    plan_quotes_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                quote_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GroupQuote"];
                };
            };
        };
    };
    m2_proposal_list: {
        parameters: {
            query?: {
                cursor?: string;
                /** @description Narrow to one request. The result set is scoped to the caller's own proposals first, so this filters a set they already own and cannot be used to discover a request they were never invited to. */
                requirement?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProposalPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_proposal_submit: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProposalCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ProposalCreateRequest"];
                "multipart/form-data": components["schemas"]["ProposalCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Proposal"];
                };
            };
            /** @description `m2_proposal_invalid_shape` when the quote does not match the requirement's lifecycle or the stage totals do not reconcile; `m2_proposal_below_wage_floor` when an A3 daily rate is under the statutory floor for the requirement's own state and skill. **Neither the state nor the skill is accepted from the caller** — both are derived from the requirement, so a vendor cannot influence the floor they are measured against. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_wage_floor_unavailable` when Operations has not mapped this variant to a wage-floor skill, has not set a state code on the service area, or has loaded no floor for that pair. This **fails closed** — an A3 quote is refused rather than accepted unchecked, because brokering labour below the statutory minimum is a violation the platform carries, not only the vendor. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_proposal_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                proposal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Proposal"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_proposal_withdraw: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                proposal_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Proposal"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    quotes_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuoteCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["QuoteCreateRequest"];
                "multipart/form-data": components["schemas"]["QuoteCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Quote"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    refunds_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                refund_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Refund"];
                };
            };
        };
    };
    m2_requirement_list: {
        parameters: {
            query?: {
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementSummaryPage"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RequirementCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RequirementCreateRequest"];
                "multipart/form-data": components["schemas"]["RequirementCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementDraft"];
                };
            };
            /** @description `m2_lifecycle_not_supported` when the service has no active A3/A5 configuration. The Customer sees 'we do not cover this yet' and a route back to the catalog, not a validation error on a field they cannot see. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementDraft"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["PatchedRequirementUpdateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PatchedRequirementUpdateRequest"];
                "multipart/form-data": components["schemas"]["PatchedRequirementUpdateRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementDraft"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_locked` once the requirement has left DRAFT and vendors have seen it. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_attachment_finalize: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttachmentFinalizeRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["AttachmentFinalizeRequest"];
                "multipart/form-data": components["schemas"]["AttachmentFinalizeRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementAttachment"];
                };
            };
            /** @description `m2_attachment_invalid` when the stored object does not match the size, media type or checksum the client declared, when the upload expired, or when it has already been finalized. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_attachment_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                attachment_id: string;
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Removed. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_attachment_upload_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AttachmentUploadRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["AttachmentUploadRequestRequest"];
                "multipart/form-data": components["schemas"]["AttachmentUploadRequestRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AttachmentUploadGrant"];
                };
            };
            /** @description `m2_attachment_invalid` for an unsupported media type, an oversized file, a malformed checksum, or more attachments than one requirement may carry. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_locked` once the requirement has left DRAFT — a photograph appearing after a vendor quoted is a scope change, not an attachment. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_attachment_unavailable` when the storage adapter is down. Retryable, and the only retryable error on this path. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_quote_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerQuoteList"];
                };
            };
            /** @description `m2_unlock_required` — the A3 quotes are still behind the unlock. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_visit_plan_required` — no A5 visit plan has been charged, so no estimate has been bought yet. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_customer_question_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                proposal_id: string;
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuestionCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["QuestionCreateRequest"];
                "multipart/form-data": components["schemas"]["QuestionCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementQuestion"];
                };
            };
            /** @description `m2_unlock_required` before an A3 unlock. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_visit_plan_required` before an A5 plan is charged; `m2_requirement_transition_not_allowed` once the request is closed. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_quote_reject: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                proposal_id: string;
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProposalRejectRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ProposalRejectRequest"];
                "multipart/form-data": components["schemas"]["ProposalRejectRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProposal"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_rejection_cap_reached` when every free replacement has been used; `m2_proposal_not_selectable` when the quote is no longer live; `m2_policy_unavailable` when the owner has not set the cap — the free replacement is refused rather than promised on a rule that does not exist. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_quote_revalidate: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                proposal_id: string;
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CustomerProposal"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_proposal_not_selectable` when the quote has not expired, when the request already has a chosen vendor, or when the caller has not unlocked these quotes at all. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_quote_teaser_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["QuoteTeaserList"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_selection_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProposalSelection"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_selection_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SelectionCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SelectionCreateRequest"];
                "multipart/form-data": components["schemas"]["SelectionCreateRequest"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProposalSelection"];
                };
            };
            /** @description `m2_unlock_required` — an A3 quote cannot be selected unread. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_selection_conflict` when another session selected first (retryable, and the answer changes on its own); `m2_proposal_not_selectable` for a superseded, withdrawn or expired quote, or an A5 estimate with no completed visit behind it; `m2_visit_plan_required` when the A5 plan is unpaid. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_submit: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["RequirementSubmitRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["RequirementSubmitRequest"];
                "multipart/form-data": components["schemas"]["RequirementSubmitRequest"];
            };
        };
        responses: {
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementSubmitted"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_duplicate` (show the duplicate and offer a merge before allowing `allow_duplicate`), `m2_requirement_expired`, or `idempotency_in_progress` — wait and re-read, never resend under a new key. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_timeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementTimeline"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_unlock_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnlockState"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_unlock_checkout_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessCheckout"];
                };
            };
            /** @description `m2_lifecycle_not_supported` on an A5 request, which uses a visit plan and has no unlock. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_unlock_not_available` when no usable quote exists yet or the request is already unlocked; `m2_access_price_unavailable` when Operations has loaded no effective price — this **fails closed** rather than charging a guess. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_vendor_card_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VendorCardList"];
                };
            };
            /** @description `m2_lifecycle_not_supported` on an A3 request. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_visit_plan_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VisitPlanState"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_visit_plan_choose: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VisitPlanChooseRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VisitPlanChooseRequest"];
                "multipart/form-data": components["schemas"]["VisitPlanChooseRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VisitPlan"];
                };
            };
            /** @description `m2_lifecycle_not_supported` on an A3 request. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_access_price_unavailable` when this tier has no effective price; `m2_requirement_transition_not_allowed` once a vendor has committed to a visit, because resizing a plan somebody is already travelling for is not a choice. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_visit_plan_checkout_create: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                requirement_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessCheckout"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_visit_plan_not_chargeable` when no vendor holds a slot yet, when the plan is already paid for, or when a reclassification credit already covers it; `m2_visit_plan_required` when no plan has been chosen. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_duplicate_check: {
        parameters: {
            query: {
                address_id: string;
                requested_start: string;
                variant_id: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProbableDuplicateList"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_requirement_question_answer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                question_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuestionAnswerRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["QuestionAnswerRequest"];
                "multipart/form-data": components["schemas"]["QuestionAnswerRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RequirementQuestion"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    scope_amendment_approve: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                amendment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AmendmentApprovalResult"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    scope_amendment_decline: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                amendment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_selection_decline: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                selection_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SelectionDeclineRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SelectionDeclineRequest"];
                "multipart/form-data": components["schemas"]["SelectionDeclineRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProposalSelection"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_selection_reconfirm: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                selection_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Engagement"];
                };
            };
            /** @description `m2_capability_not_approved` or `m2_capability_suspended` when the lifecycle capability is no longer live. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_reconfirmation_expired` when the deadline passed — the selection is expired in the same call, so the Customer is not left waiting; `m2_capacity_unavailable` when the vendor's diary filled; `m2_proposal_not_selectable` when the quote's own validity elapsed; `m2_policy_unavailable` when the A5 commission terms are unset. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    service_areas_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PartnerServiceAreaOption"][];
                };
            };
        };
    };
    serviceability_check_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ServiceabilityRequestRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["ServiceabilityRequestRequest"];
                "multipart/form-data": components["schemas"]["ServiceabilityRequestRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceabilityResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    services_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                service_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceDetail"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    services_configuration_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                service_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceDetail"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_site_visit_arrival_confirm: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                site_visit_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SiteVisit"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_transition_not_allowed` when the visit is not scheduled — a visit whose plan payment has not been verified is still held, not scheduled, and nobody has arrived at it. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_site_visit_complete: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                site_visit_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["SiteVisitCompleteRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SiteVisitCompleteRequest"];
                "multipart/form-data": components["schemas"]["SiteVisitCompleteRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SiteVisit"];
                };
            };
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_transition_not_allowed` when the visit was never scheduled. A visit with no agreed time cannot have happened. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_site_visit_no_show_report: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                site_visit_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VisitNoShowRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["VisitNoShowRequest"];
                "multipart/form-data": components["schemas"]["VisitNoShowRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SiteVisit"];
                };
            };
            /** @description `m2_requirement_transition_not_allowed` when a party reports its own no-show. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_transition_not_allowed` when the visit was never scheduled; `m2_policy_unavailable` when the owner has not decided how a customer no-show settles the platform share. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    m2_site_visit_schedule: {
        parameters: {
            query?: never;
            header: {
                /** @description Stable opaque key for this logical command. Reuse it only when retrying the identical request; using it with a different payload returns 409. */
                "Idempotency-Key": string;
            };
            path: {
                site_visit_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SiteVisitScheduleRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["SiteVisitScheduleRequest"];
                "multipart/form-data": components["schemas"]["SiteVisitScheduleRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SiteVisit"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description `m2_requirement_transition_not_allowed` once the visit is completed or cancelled. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    tax_documents_retrieve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                document_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxDocument"];
                };
            };
        };
    };
}
