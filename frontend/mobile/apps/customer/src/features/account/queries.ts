// Ported from frontend/apps/customer/features/account/queries.ts
import { request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE, queryKeys } from "@vsolve/query/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@vsolve/mobile-core";

export type CustomerProfile = Schemas["User"];
export type CustomerProfileUpdate = Schemas["PatchedCustomerProfileUpdateRequest"];

export function useCustomerProfile(enabled = true) {
  return useQuery({
    queryKey: queryKeys.session.profile(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/profile/")),
    enabled,
    ...SESSION_STATE,
  });
}

/**
 * Saves only customer-owned personal fields. The phone number remains the
 * verified sign-in identity and is deliberately absent from the command.
 */
export function useUpdateCustomerProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profile: CustomerProfileUpdate) =>
      request(() => getApiClient().PATCH("/api/v1/auth/profile/", { body: profile })),
    onSuccess: (profile) => {
      queryClient.setQueryData<CustomerProfile>(queryKeys.session.profile(), profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.current() });
    },
    retry: false,
  });
}

/**
 * The privacy record: what we may send, what was agreed to, what was asked for.
 *
 * Three endpoints with three quite different shapes, and the differences are the
 * interesting part.
 *
 * ## Preferences are an upsert, not a collection
 *
 * `PUT /api/v1/auth/privacy/preferences/` takes **one** `{channel, purpose,
 * is_enabled}` and returns that one, while `GET` returns the whole array. So the
 * write is per-switch and the read is per-person, and the cache write has to
 * merge rather than replace — see `useSetCommunicationPreference`.
 *
 * ## Consent receipts can be written and never read back
 *
 * `POST /api/v1/auth/privacy/consents/` is the only published consent operation.
 * There is no `GET`: `ConsentReceiptView` in `apps/identity/views.py` defines
 * `post` and nothing else. That is a real product gap, not an oversight in this
 * client, and it decides how the screen behaves — the receipt from a recording
 * is shown, and the customer is told plainly that the durable copy is Django's
 * and reachable through an access request. Inventing a client-side history here
 * would be showing someone a consent log we did not read.
 *
 * ## Requests are a log the customer cannot edit
 *
 * `GET` lists, `POST` files. Status is Django's word — `RECEIVED`, `IN_REVIEW`,
 * `COMPLETED`, `REJECTED` — and is rendered as sent rather than derived from
 * timestamps, for the same reason `bookings/queries.ts` renders `recovery_action`
 * as sent: a second implementation of the server's rule eventually disagrees
 * with it.
 */

export type CommunicationPreference = Schemas["CommunicationPreference"];
export type PreferenceChannel = Schemas["ChannelEnum"];
export type ConsentReceipt = Schemas["ConsentReceipt"];
export type PrivacyRequest = Schemas["PrivacyRequest"];
export type PrivacyRequestKind = Schemas["PrivacyRequestKindEnum"];
export type PrivacyStatus = Schemas["PrivacyStatusEnum"];

/* -------------------------------------------------------------------------
   Communication preferences
   ------------------------------------------------------------------------- */

export function useCommunicationPreferences(enabled = true) {
  return useQuery({
    queryKey: queryKeys.privacy.preferences(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/privacy/preferences/")),
    enabled,
    ...SESSION_STATE,
  });
}

export interface PreferenceInput {
  channel: PreferenceChannel;
  purpose: string;
  isEnabled: boolean;
}

/**
 * Turns one channel-and-purpose on or off.
 *
 * Not optimistic. A messaging switch is a promise about what we will send to
 * someone's phone, and showing "off" before Django has stored it is the one
 * outcome that turns a failed request into a broken promise. The row shows a
 * pending state instead, and the switch moves when the server's own record comes
 * back.
 *
 * The response is merged into the list by `(channel, purpose)`, which is the
 * natural key Django orders by. A returned pair that is not in the list yet is
 * appended: the server creates preferences lazily, so the first time someone
 * turns a purpose off it did not previously exist as a row.
 */
export function useSetCommunicationPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PreferenceInput) =>
      request(() =>
        getApiClient().PUT("/api/v1/auth/privacy/preferences/", {
          body: {
            channel: input.channel,
            purpose: input.purpose,
            is_enabled: input.isEnabled,
          },
        }),
      ),
    onSuccess: (preference) => {
      queryClient.setQueryData<CommunicationPreference[]>(
        queryKeys.privacy.preferences(),
        (current = []) => {
          const index = current.findIndex(
            (item) =>
              item.channel === preference.channel && item.purpose === preference.purpose,
          );
          if (index === -1) return [...current, preference];
          return current.map((item, position) => (position === index ? preference : item));
        },
      );
    },
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Consent receipts
   ------------------------------------------------------------------------- */

export interface ConsentInput {
  purpose: string;
  policyVersion: string;
}

/**
 * Records acceptance of a named policy version.
 *
 * No cache write, because there is no cached list to write into — see the module
 * note. The receipt is the mutation's own data, and the screen renders it from
 * there for as long as the customer is looking at it.
 */
export function useRecordConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConsentInput) =>
      request(() =>
        getApiClient().POST("/api/v1/auth/privacy/consents/", {
          body: { purpose: input.purpose, policy_version: input.policyVersion },
        }),
      ),
    onSuccess: () => {
      // Consent for a purpose is the lawful basis the preference sits on, and
      // Django may enable the corresponding channel when it is granted. Re-read
      // rather than assume either way.
      void queryClient.invalidateQueries({ queryKey: queryKeys.privacy.preferences() });
    },
    retry: false,
  });
}

/* -------------------------------------------------------------------------
   Access and erasure requests
   ------------------------------------------------------------------------- */

export function usePrivacyRequests(enabled = true) {
  return useQuery({
    queryKey: queryKeys.privacy.requests(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/privacy/requests/")),
    enabled,
    ...SESSION_STATE,
  });
}

/**
 * Files an access or erasure request.
 *
 * The created request is prepended from the server's 201 body. Django decides
 * the id, the `requested_at` stamp and the opening status, and a row built from
 * the form would be showing a request that does not exist in the shape the
 * server holds it.
 */
export function useCreatePrivacyRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (kind: PrivacyRequestKind) =>
      request(() =>
        getApiClient().POST("/api/v1/auth/privacy/requests/", { body: { kind } }),
      ),
    onSuccess: (created) => {
      queryClient.setQueryData<PrivacyRequest[]>(
        queryKeys.privacy.requests(),
        (current = []) => [created, ...current.filter((item) => item.id !== created.id)],
      );
    },
    retry: false,
  });
}

/** Still being worked on: the customer cannot file the same thing again yet. */
export function isRequestOpen(privacyRequest: PrivacyRequest): boolean {
  return privacyRequest.status === "RECEIVED" || privacyRequest.status === "IN_REVIEW";
}
