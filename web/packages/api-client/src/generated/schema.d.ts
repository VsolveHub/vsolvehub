/**
 * DO NOT EDIT. Generated from the published Django OpenAPI contract.
 *
 * Source:   contracts/openapi/v1.yaml (version 1.2.0)
 * Checksum: 845f5523c371c7b1
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
        AuthenticatedSession: {
            readonly user: components["schemas"]["User"];
            /** Format: date-time */
            readonly session_expires_at: string;
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
         * @description * `APPROVED` - APPROVED
         *     * `REJECTED` - REJECTED
         * @enum {string}
         */
        DecisionEnum: "APPROVED" | "REJECTED";
        ExpectedVersionRequest: {
            expected_version: number;
        };
        Money: {
            readonly amount_paise: number;
            readonly currency: string;
        };
        OperationsDocumentReviewRequest: {
            decision: components["schemas"]["DecisionEnum"];
            reason?: string;
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
            readonly status: components["schemas"]["PartnerDocumentStatusEnum"];
            readonly review_reason: string;
            /** Format: date-time */
            readonly uploaded_at: string;
            /** Format: date-time */
            readonly reviewed_at: string | null;
        };
        PartnerDocumentCreateRequest: {
            expected_version: number;
            kind: components["schemas"]["PartnerDocumentKindEnum"];
            object_key: string;
            content_type: string;
            size_bytes: number;
            sha256: string;
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
        /**
         * @description * `PENDING` - Pending review
         *     * `APPROVED` - Approved
         *     * `REJECTED` - Rejected
         *     * `SUPERSEDED` - Superseded
         * @enum {string}
         */
        PartnerDocumentStatusEnum: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
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
        /**
         * @description * `MANUAL` - Manual
         *     * `REVERSE_GEOCODED` - Reverse geocoded
         * @enum {string}
         */
        SourceEnum: "MANUAL" | "REVERSE_GEOCODED";
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
            /** @description A CSRF cookie has been set. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                    "application/json": components["schemas"]["User"];
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
                "application/json": components["schemas"]["PartnerDocumentCreateRequest"];
                "application/x-www-form-urlencoded": components["schemas"]["PartnerDocumentCreateRequest"];
                "multipart/form-data": components["schemas"]["PartnerDocumentCreateRequest"];
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
