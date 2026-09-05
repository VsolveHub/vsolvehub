"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type RatingSummary = Schemas["RatingSummary"];
export type RatingSubject = "booking" | "engagement";

export const ratingKey = (subject: RatingSubject, id: string) =>
  ["service-ratings", subject, id] as const;

export function useRatings(subject: RatingSubject, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ratingKey(subject, id),
    queryFn: () =>
      subject === "booking"
        ? request(() =>
            getApiClient().GET("/api/v1/bookings/{booking_id}/ratings/", {
              params: { path: { booking_id: id } },
            }),
          )
        : request(() =>
            getApiClient().GET("/api/v1/engagements/{engagement_id}/ratings/", {
              params: { path: { engagement_id: id } },
            }),
          ),
    enabled,
    ...VOLATILE_STATE,
    retry: 1,
  });
}

export function useSubmitRating(subject: RatingSubject, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { score: number; comment: string }) =>
      subject === "booking"
        ? request(() =>
            getApiClient().POST("/api/v1/bookings/{booking_id}/ratings/", {
              params: { path: { booking_id: id } },
              body: input,
            }),
          )
        : request(() =>
            getApiClient().POST("/api/v1/engagements/{engagement_id}/ratings/", {
              params: { path: { engagement_id: id } },
              body: input,
            }),
          ),
    onSuccess: (summary) => queryClient.setQueryData(ratingKey(subject, id), summary),
    onError: () => void queryClient.invalidateQueries({ queryKey: ratingKey(subject, id) }),
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   "How was Vsolve" — the second question, asked separately (contract 1.59.0)
   --------------------------------------------------------------------------- */

export type PlatformFeedbackSummary = Schemas["PlatformFeedbackSummary"];
export type PlatformFeedbackTagOption = Schemas["PlatformFeedbackTagOption"];
export type PlatformFeedbackTag = Schemas["PlatformFeedbackTagEnum"];

export const platformFeedbackKey = (subject: RatingSubject, id: string) =>
  ["platform-feedback", subject, id] as const;

/**
 * Whether we may still ask this customer what they think of us, and what they said if we already
 * did.
 *
 * Its own query rather than a field on the rating summary: the two questions are answered
 * independently — a customer may rate their partner and skip us, or skip the partner and tell us
 * the checkout was confusing — so one cache entry going stale must not invalidate the other.
 */
export function usePlatformFeedback(subject: RatingSubject, id: string, enabled: boolean) {
  return useQuery({
    queryKey: platformFeedbackKey(subject, id),
    queryFn: () =>
      subject === "booking"
        ? request(() =>
            getApiClient().GET("/api/v1/bookings/{booking_id}/platform-feedback/", {
              params: { path: { booking_id: id } },
            }),
          )
        : request(() =>
            getApiClient().GET("/api/v1/engagements/{engagement_id}/platform-feedback/", {
              params: { path: { engagement_id: id } },
            }),
          ),
    enabled,
    ...VOLATILE_STATE,
    retry: 1,
  });
}

export interface PlatformFeedbackInput {
  readonly score: number | null;
  readonly tags: readonly PlatformFeedbackTag[];
  readonly comment: string;
}

export function useSubmitPlatformFeedback(subject: RatingSubject, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformFeedbackInput) => {
      const body = { score: input.score, tags: [...input.tags], comment: input.comment };
      return subject === "booking"
        ? request(() =>
            getApiClient().POST("/api/v1/bookings/{booking_id}/platform-feedback/", {
              params: { path: { booking_id: id } },
              body,
            }),
          )
        : request(() =>
            getApiClient().POST("/api/v1/engagements/{engagement_id}/platform-feedback/", {
              params: { path: { engagement_id: id } },
              body,
            }),
          );
    },
    onSuccess: (summary) =>
      queryClient.setQueryData(platformFeedbackKey(subject, id), summary),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: platformFeedbackKey(subject, id) }),
    retry: false,
  });
}
