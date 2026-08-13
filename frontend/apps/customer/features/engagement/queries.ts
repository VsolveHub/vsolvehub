"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStableIdempotencyKey, request } from "@vsolve/api-client";
import {
  M2_FRESHNESS,
  boundedPoll,
  isEngagementSettled,
  m2QueryKeys,
  shouldRetryM2Read,
  type Engagement,
} from "@vsolve/query";

import { getApiClient } from "@/lib/api/browser";

/**
 * The Customer's engagement reads and the one command on them — contract 1.24.0.
 *
 * `GET /engagements/{id}/` is the agreement frozen at reconfirmation, with its
 * ordered stages. `POST /engagement-stages/{id}/funding/` funds one A5 stage.
 *
 * ## Why the read polls, and only while money is in flight
 *
 * An engagement moves when somebody does some work — days, not seconds — so a
 * timer on it would be load for nothing. A **stage funding charge** is the
 * exception: like every other M2 charge it settles on a verified provider
 * callback, and the Customer is sitting on the screen waiting for it.
 * `isEngagementSettled` is false exactly while a stage reads `PENDING`.
 */

export type { Engagement };

/**
 * One engagement, both archetypes.
 *
 * A `404` is not retried: object-level authorization answers `404` rather than
 * `403` wherever existence is private, so it means "gone, or never yours" and
 * neither becomes true on a second attempt.
 */
export function useEngagement(engagementId: string | null) {
  return useQuery({
    queryKey: m2QueryKeys.engagements.detail(engagementId ?? ""),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/engagements/{engagement_id}/", {
          params: { path: { engagement_id: engagementId! } },
        }),
      ),
    enabled: engagementId !== null,
    ...M2_FRESHNESS.engagementDetail,
    ...boundedPoll<Engagement>({ isSettled: isEngagementSettled }),
    retry: shouldRetryM2Read,
  });
}

export interface FundStageInput {
  engagementId: string;
  stageId: string;
}

/**
 * Funds one A5 stage — `M2-FE-416`, `M2-FE-417`.
 *
 * **At face value.** There is no stage credit: the visit-plan money was spent on
 * the visits themselves and settles per share, so discounting a stage by it
 * would pay for those visits twice out of the vendor's work. No screen in this
 * app may imply otherwise, and nothing here subtracts anything.
 *
 * Keyed on the stage, which is the aggregate being charged for. One stage is
 * funded once, so a double press, a dropped connection and a reopened tab all
 * land on the same attempt.
 *
 * `409 m2_stage_not_funded` covers three different facts — already funded, an
 * earlier stage is not, or the engagement is `LEAD_ONLY` and paid directly to
 * the vendor. None is fixed by retrying and all three are fixed by re-reading,
 * which `onSettled` does.
 */
export function useFundStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: FundStageInput) =>
      request(() =>
        getApiClient().POST("/api/v1/engagement-stages/{stage_id}/funding/", {
          params: {
            path: { stage_id: input.stageId },
            header: {
              "Idempotency-Key": getStableIdempotencyKey(`m2-stage-funding:${input.stageId}`),
            },
          },
        }),
      ),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({
        queryKey: m2QueryKeys.engagements.detail(input.engagementId),
      });
    },
    retry: false,
  });
}
