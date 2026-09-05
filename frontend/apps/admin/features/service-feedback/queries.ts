"use client";

import { request, type Schemas } from "@vsolve/api-client";
import { SESSION_STATE } from "@vsolve/query";
import { useQuery } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type ServiceFeedbackList = Schemas["ServiceFeedbackList"];
export type ServiceFeedbackRow = Schemas["ServiceFeedbackRow"];
export type ServiceFeedbackNoteList = Schemas["ServiceFeedbackNoteList"];
export type ServiceFeedbackNote = Schemas["ServiceFeedbackNote"];

/** The windows an operator actually reasons in. `null` is everything ever recorded. */
export const FEEDBACK_WINDOWS = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last year" },
  { days: null, label: "All time" },
] as const;

export type FeedbackWindow = (typeof FEEDBACK_WINDOWS)[number]["days"];

export const serviceFeedbackKeys = {
  all: ["operations", "service-feedback"] as const,
  list: (days: FeedbackWindow) => [...serviceFeedbackKeys.all, "list", days] as const,
  notes: (variantId: string | null, days: FeedbackWindow) =>
    [...serviceFeedbackKeys.all, "notes", variantId ?? "unattributed", days] as const,
};

/**
 * Both verdicts per service, worst platform score first.
 *
 * Keyed by window so switching period does not show the previous period's numbers under the new
 * label while the fetch is in flight — the one mistake this screen must not make is showing an
 * operator figures for a range they did not choose.
 */
export function useServiceFeedback(days: FeedbackWindow) {
  return useQuery<ServiceFeedbackList>({
    queryKey: serviceFeedbackKeys.list(days),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/service-feedback/", {
          params: { query: days === null ? {} : { days } },
        }),
      ),
    ...SESSION_STATE,
    retry: false,
  });
}

/**
 * The written notes behind one service's numbers.
 *
 * The unattributed bucket has no id, so it has its own route rather than a magic value in the
 * variant one — a UUID path that quietly accepts the word "none" is a path that will one day
 * accept something else by accident.
 */
export function useServiceFeedbackNotes(
  variantId: string | null,
  days: FeedbackWindow,
  enabled: boolean,
) {
  return useQuery<ServiceFeedbackNoteList>({
    queryKey: serviceFeedbackKeys.notes(variantId, days),
    queryFn: () =>
      variantId === null
        ? request(() =>
            getApiClient().GET("/api/v1/operations/service-feedback/unattributed/notes/", {
              params: { query: days === null ? {} : { days } },
            }),
          )
        : request(() =>
            getApiClient().GET("/api/v1/operations/service-feedback/{variant_id}/notes/", {
              params: {
                path: { variant_id: variantId },
                query: days === null ? {} : { days },
              },
            }),
          ),
    enabled,
    ...SESSION_STATE,
    retry: false,
  });
}
