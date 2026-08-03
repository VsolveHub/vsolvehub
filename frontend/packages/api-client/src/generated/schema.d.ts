/**
 * DO NOT EDIT. Generated from the published Django OpenAPI contract.
 *
 * Source:   contracts/openapi/v1.yaml (version 1.10.0)
 * Checksum: 739fe46b63f77232
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
        delete: operations["cart_items_destroy"];
        options?: never;
        head?: never;
        patch: operations["cart_items_partial_update"];
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
         *     * `REPLAN_REQUIRED` - Replan required
         *     * `CANCELLED` - Cancelled
         *     * `EXPIRED` - Expired
         *     * `FAILED` - Failed
         * @enum {string}
         */
        BookingGroupStatusEnum: "CONFIRMED" | "MATCHING" | "PARTIALLY_HELD" | "ALL_UNITS_HELD" | "PAYMENT_PENDING" | "BOOKED" | "REPLAN_REQUIRED" | "CANCELLED" | "EXPIRED" | "FAILED";
        BookingWindow: {
            readonly id: string;
            /** Format: date-time */
            readonly starts_at: string;
            /** Format: date-time */
            readonly ends_at: string;
            readonly is_available: boolean;
            readonly unavailable_reason: (components["schemas"]["UnavailableReasonEnum"] | components["schemas"]["NullEnum"]) | null;
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
            readonly days: components["schemas"]["BookingWindowDay"][];
        };
        BookingWindowsRequestRequest: {
            /** Format: uuid */
            address_id: string;
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
         * @description * `APPROVED` - APPROVED
         *     * `REJECTED` - REJECTED
         * @enum {string}
         */
        DecisionEnum: "APPROVED" | "REJECTED";
        /**
         * @description * `NONE` - No ordering dependency
         *     * `LEFT_BEFORE_RIGHT` - Left before right
         *     * `RIGHT_BEFORE_LEFT` - Right before left
         * @enum {string}
         */
        DependencyEnum: "NONE" | "LEFT_BEFORE_RIGHT" | "RIGHT_BEFORE_LEFT";
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
        FulfilmentPlanSetCreateRequest: {
            /** Format: uuid */
            address_id: string;
            expected_cart_version: number;
            /** Format: date-time */
            preferred_start: string;
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
            readonly lines: components["schemas"]["FulfilmentUnitLine"][];
            readonly total: components["schemas"]["Money"];
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
         *     * `CANCELLED` - Cancelled
         *     * `FAILED` - Failed
         *     * `COMPLETED` - Completed
         * @enum {string}
         */
        FulfilmentUnitStatusEnum: "PLANNED" | "MATCHING" | "HELD" | "PAYMENT_PENDING" | "BOOKED" | "CANCELLED" | "FAILED" | "COMPLETED";
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
        };
        OfferPage: {
            /** Format: uri */
            next: string | null;
            /** Format: uri */
            previous: string | null;
            results: components["schemas"]["Offer"][];
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
         * @description * `BOOKING_GROUP` - Booking group
         * @enum {string}
         */
        PurposeEnum: "BOOKING_GROUP";
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
         * @description * `PENDING` - Pending
         *     * `IN_SYNC` - In sync
         *     * `NEEDS_ATTENTION` - Needs attention
         * @enum {string}
         */
        ReconciliationStateEnum: "PENDING" | "IN_SYNC" | "NEEDS_ATTENTION";
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
        /**
         * @description * `PAST` - PAST
         *     * `TOO_SOON` - TOO_SOON
         *     * `OUTSIDE_OPERATING_WINDOW` - OUTSIDE_OPERATING_WINDOW
         *     * `NO_CAPACITY` - NO_CAPACITY
         * @enum {string}
         */
        UnavailableReasonEnum: "PAST" | "TOO_SOON" | "OUTSIDE_OPERATING_WINDOW" | "NO_CAPACITY";
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
        WebhookAccepted: {
            readonly accepted: boolean;
            readonly duplicate: boolean;
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
    booking_group_list: {
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
                    "application/json": components["schemas"]["BookingGroupPage"];
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
    partner_offer_list: {
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
                    "application/json": components["schemas"]["OfferPage"];
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
