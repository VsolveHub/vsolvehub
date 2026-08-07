/**
 * DO NOT EDIT. Generated from the published Django OpenAPI contract.
 *
 * Source:   contracts/openapi/v1.yaml (version 1.18.0)
 * Checksum: 0ba901c83c78efb8
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
        AuthenticatedSession: {
            readonly user: components["schemas"]["User"];
            readonly active_role: string;
            /** Format: date-time */
            readonly session_expires_at: string;
        };
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
        CancellationBand: {
            readonly code: string;
            readonly condition_text: string;
            readonly fee: components["schemas"]["Money"];
        };
        CancellationPolicy: {
            readonly code: string;
            readonly version: number;
            readonly bands: components["schemas"]["CancellationBand"][];
        };
        Cart: {
            /** Format: uuid */
            readonly id: string;
            readonly version: number;
            readonly items: components["schemas"]["CartItemDetail"][];
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
            readonly partner_display_name: string;
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
            /** Format: date-time */
            readonly server_now: string;
        };
        CustomerContactAttemptRequestRequest: {
            outcome: string;
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
         *     * `PAYMENTS` - Payment collection
         *     * `PAYOUTS` - Partner payouts
         *     * `DISPATCH` - Partner dispatch
         *     * `SERVICE_AREA` - One service area
         *     * `SERVICE` - One service
         * @enum {string}
         */
        KillSwitchScopeEnum: "NOTIFICATIONS" | "SMS" | "PAYMENTS" | "PAYOUTS" | "DISPATCH" | "SERVICE_AREA" | "SERVICE";
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
            readonly status: components["schemas"]["StatusD12Enum"];
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
            readonly status: components["schemas"]["StatusD12Enum"];
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
        /**
         * @description * `PENDING` - Pending scan
         *     * `CLEAN` - Clean
         *     * `FAILED` - Failed scan
         * @enum {string}
         */
        ProcessingStatusEnum: "PENDING" | "CLEAN" | "FAILED";
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
         * @enum {string}
         */
        PurposeEnum: "BOOKING_GROUP" | "SCOPE_AMENDMENT_REVISION";
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
        ReleaseKillSwitchRequestRequest: {
            scope: components["schemas"]["KillSwitchScopeEnum"];
            /** @default  */
            target: string;
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
         * @enum {string}
         */
        ScopeAmendmentLineKindEnum: "TASK" | "MATERIAL";
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
            readonly starting_price: components["schemas"]["Money"];
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
            readonly starting_price: components["schemas"]["Money"];
            readonly cover: components["schemas"]["ServiceMedia"] | null;
            description?: string;
            readonly variants: components["schemas"]["ServiceVariantConfiguration"][];
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
            readonly text: string;
        };
        /**
         * @description * `INCLUDED` - Included
         *     * `EXCLUDED` - Not included
         *     * `GOOD_TO_KNOW` - Good to know
         * @enum {string}
         */
        ServicePolicyKindEnum: "INCLUDED" | "EXCLUDED" | "GOOD_TO_KNOW";
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
         * @description * `MANUAL` - Manual
         *     * `REVERSE_GEOCODED` - Reverse geocoded
         * @enum {string}
         */
        SourceEnum: "MANUAL" | "REVERSE_GEOCODED";
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
        /**
         * @description * `PENDING` - Pending review
         *     * `APPROVED` - Approved
         *     * `REJECTED` - Rejected
         *     * `SUPERSEDED` - Superseded
         * @enum {string}
         */
        StatusD12Enum: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
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
