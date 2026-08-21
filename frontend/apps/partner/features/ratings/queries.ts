"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type Schemas } from "@vsolve/api-client";
import { VOLATILE_STATE } from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

export type RatingSubject = "booking" | "engagement";
export type RatingSummary = Schemas["RatingSummary"];

const ratingKey = (subject: RatingSubject, id: string) =>
  ["partner-service-ratings", subject, id] as const;

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
