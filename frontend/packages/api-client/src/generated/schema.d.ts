/**
 * DO NOT EDIT. Generated from the published Django OpenAPI contract.
 *
 * Source:   contracts/openapi/v1.yaml (version 1.5.0)
 * Checksum: c7b170f2cbb699bb
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
    "/api/v1/partner/me/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_me_retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/partner/offers/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["partner_offers_list"];
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
        AssistedCheckoutCreateRequest: {
            /** Format: uuid */
            customer_id: string;
            /** Format: uuid */
            quote_id: string;
            consent_purpose: string;
            consent_version: string;
        };
        AuthenticatedSession: {
            readonly user: components["schemas"]["User"];
            readonly active_role: string;
            /** Format: date-time */
            readonly session_expires_at: string;
        };
        CartItem: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly variant_id: string;
            readonly quantity: number;
            readonly scope_schema_snapshot: unknown;
        };
        CartItemInputRequest: {
            /** Format: uuid */
            variant_id: string;
            quantity: number;
            scope?: {
                [key: string]: unknown;
            };
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
         *     * `EXPIRED` - Expired
         * @enum {string}
         */
        CheckoutStatusEnum: "CREATED" | "FINDING_PARTNER" | "PARTNER_COMMITTED" | "PAYMENT_PENDING" | "COMPLETED" | "EXPIRED";
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
         * @description * `APPROVED` - APPROVED
         *     * `REJECTED` - REJECTED
         * @enum {string}
         */
        DecisionEnum: "APPROVED" | "REJECTED";
        ExpectedVersionRequest: {
            expected_version: number;
        };
        ManualOfferRequest: {
            /** Format: uuid */
            partner_id: string;
        };
        Money: {
            readonly amount_paise: number;
            readonly currency: string;
        };
        Offer: {
            /** Format: uuid */
            readonly id: string;
            /** Format: uuid */
            readonly checkout_id: string;
            readonly status: components["schemas"]["OfferStatusEnum"];
            /** Format: date-time */
            readonly expires_at: string;
            /** Format: date-time */
            readonly undo_deadline: string | null;
            /** Format: date-time */
            readonly created_at: string;
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
        OperationsDocumentReviewRequest: {
            decision: components["schemas"]["DecisionEnum"];
            reason?: string;
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
         * @description * `FIXED` - Fixed
         *     * `DURATION` - Duration based
         *     * `INSPECTION` - Inspection first
         * @enum {string}
         */
        PricingStrategyEnum: "FIXED" | "DURATION" | "INSPECTION";
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
        Quote: {
            /** Format: uuid */
            readonly id: string;
            readonly task_subtotal_paise: number;
            readonly minimum_visit_adjustment_paise: number;
            readonly platform_fee_paise: number;
            readonly total_paise: number;
            readonly estimated_duration_minutes: number;
            /** Format: date-time */
            readonly requested_start: string;
            readonly arrival_window_minutes: number;
            readonly quote_inputs_snapshot: unknown;
            /** Format: date-time */
            readonly created_at: string;
        };
        QuoteCreateRequest: {
            /** Format: uuid */
            address_id: string;
            /** Format: date-time */
            requested_start: string;
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
            readonly recommended_duration_minutes: number;
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
            readonly recommended_duration_minutes: number;
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
            readonly pricing_strategy: components["schemas"]["PricingStrategyEnum"];
            readonly starting_price: components["schemas"]["Money"];
            readonly minimum_duration_minutes: number;
            readonly recommended_duration_minutes: number;
            readonly duration_increment_minutes: number;
            readonly maximum_duration_minutes: number;
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
        StepUpSession: {
            /** Format: date-time */
            readonly stepped_up_at: string;
        };
        Subcategory: {
            /** Format: uuid */
            readonly id: string;
            readonly slug: string;
            readonly name: string;
            readonly description: string;
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
                    "application/json": components["schemas"]["CartItem"];
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
    partner_offers_list: {
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
                    "application/json": components["schemas"]["Offer"][];
                };
            };
        };
    };
    partner_offers_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                action: string;
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
}
