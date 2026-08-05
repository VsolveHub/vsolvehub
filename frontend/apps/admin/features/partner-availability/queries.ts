"use client";

import { ApiRequestError, request, type Schemas } from "@vsolve/api-client";
import { useMutation } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import type { ScheduleDraft } from "./model/schedule";

/**
 * Rewriting a Partner's availability on their behalf.
 *
 * ## Consent is enforced, not asserted
 *
 * `replace_partner_schedule_for_operations` looks for a live `PartnerConsent`
 * matching the purpose and version, and refuses without one. So the two consent
 * fields are not paperwork this console collects — they are the lookup that
 * decides whether the change is permitted at all. Getting them wrong produces a
 * refusal, not a silently unaudited write, which is the right way round.
 *
 * ## Nothing is cached
 *
 * There is no Operations read of a Partner's schedule to cache, and the response
 * to this command is the new schedule for one Partner at one instant. Writing it
 * into a query cache would create a "current schedule" the console could serve
 * later without asking — a stale answer to a question about somebody's working
 * week. The result is rendered from the mutation and then let go.
 */

export interface ScheduleResult {
  rules: Schemas["PartnerAvailabilityRule"][];
  exceptions: Schemas["PartnerAvailabilityException"][];
}

function toRequest(draft: ScheduleDraft) {
  return {
    consent_purpose: draft.consentPurpose.trim(),
    consent_document_version: draft.consentVersion.trim(),
    rules: draft.rules.map((rule) => ({
      service_area_id: rule.serviceAreaId.trim(),
      weekday: rule.weekday,
      starts_at: rule.startsAt,
      ends_at: rule.endsAt,
      ends_next_day: rule.endsNextDay,
    })),
    exceptions: draft.exceptions.map((exception) => ({
      service_area_id: exception.serviceAreaId.trim(),
      date: exception.date,
      is_available: exception.isAvailable,
      // A day off carries no hours. Sending the leftovers of a row that was
      // switched from "working" to "not working" would publish times the
      // operator had already decided against.
      starts_at: exception.isAvailable ? exception.startsAt : null,
      ends_at: exception.isAvailable ? exception.endsAt : null,
      ends_next_day: exception.isAvailable ? exception.endsNextDay : false,
      reason: exception.reason.trim(),
    })),
  };
}

export function useReplacePartnerSchedule() {
  return useMutation({
    mutationFn: (draft: ScheduleDraft): Promise<ScheduleResult> =>
      request(() =>
        getApiClient().PUT("/api/v1/operations/partners/{partner_id}/availability/", {
          params: { path: { partner_id: draft.partnerId.trim() } },
          body: toRequest(draft),
        }),
      ),
    // Never retried. This command replaces a whole week; an automatic second
    // attempt after an ambiguous failure could overwrite a change somebody else
    // made in between.
    retry: false,
  });
}

/** No such Partner, or no application for them. */
export function isUnknownPartner(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/**
 * The schedule itself was refused — bad windows, areas the Partner does not
 * hold, an offboarded Partner, or no live consent receipt.
 *
 * Django sends its own sentence for each of these, and it is specific enough to
 * act on, so it is shown rather than replaced with a guess.
 */
export function isScheduleRefused(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "partner_schedule_invalid" ||
      error.code === "partner_transition_not_allowed" ||
      error.status === 400)
  );
}
