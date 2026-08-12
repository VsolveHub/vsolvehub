"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  unwrap,
} from "@vsolve/api-client";
import { SESSION_STATE } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import { registrationKeys } from "@/features/capability/queries";
import type {
  CrewMemberInput,
  CrewMemberPatch,
  CrewMemberRecord,
  CrewRoster,
} from "@/features/capability/adapters/wire";

/**
 * The crew roster and its three commands (contract 1.22.0).
 *
 * `M2-FE-107`. Reached at first assignment, never from registration — nothing in
 * `/apply` links here, and the `CREW_ROSTER` gate blocks exactly one action,
 * `crew.assign`, rather than the workspace.
 *
 * ## The roster publishes `membership_id` and a masked phone, and nothing else
 *
 * There is no `crew_member_id` in the payload and there must never be one in a
 * request from this app. Identity is global — `CrewMember.identity_hash` — and
 * handing one agency the global id would let two agencies compare rosters and
 * discover a worker is on both. Every command below takes `membership_id`, which
 * is per-Partner and correlates with nothing.
 *
 * `phone_masked` is four digits, and the full number is never stored server-side
 * at all, so this is not a redaction of something Vsolve holds — it is the whole
 * of what exists. Four digits are what let a Partner tell two people called
 * Ramesh apart.
 */

/* ---------------------------------------------------------------------------
   Read
   --------------------------------------------------------------------------- */

/**
 * This Partner's roster.
 *
 * `SESSION_STATE`: a roster changes when the Partner edits it, or when
 * Operations verifies someone's documents. It carries no deadline, so
 * revalidating on focus is enough and a volatile tier would refetch a list of
 * names on every tab switch during a shift.
 */
export function usePartnerCrew(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<CrewRoster>({
    queryKey: registrationKeys.crew(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/crew/")),
    enabled,
    ...SESSION_STATE,
    retry: (failureCount, error) =>
      error instanceof ApiRequestError && [401, 403, 404].includes(error.status)
        ? false
        : failureCount < 2,
  });
}

/* ---------------------------------------------------------------------------
   Commands
   --------------------------------------------------------------------------- */

/**
 * The result of adding someone, and whether they were already known.
 *
 * `POST /partner/crew/` answers **`201` for a new membership and `200` for a
 * reinstated one**, because `add_crew_member` un-archives a returning worker
 * rather than failing or duplicating. That status code is the only thing that
 * distinguishes the two outcomes — the body is the same `CrewMember` either way
 * — and seasonal labour makes reinstatement the normal case, not an edge one.
 *
 * Reading it is what lets the screen say "we put Ramesh back on your roster"
 * instead of silently succeeding on a name the Partner thought was gone and
 * leaving them to wonder whether they have created a second entry for the same
 * person. They have not, and being told so is the point.
 */
export interface CrewAddResult {
  readonly member: CrewMemberRecord;
  /** `true` when the server answered `200` — an archived membership came back. */
  readonly wasReinstated: boolean;
}

/**
 * One stable key per person, for the life of that logical add.
 *
 * Scoped to the phone number rather than to the form, because the phone number
 * *is* the identity — `add_crew_member` hashes it to resolve one person across
 * every agency roster they appear on. Two taps on the same person replay; a
 * different person is a different logical command and gets its own key.
 */
function crewAddScope(phoneE164: string): string {
  return `m2-crew:add:${phoneE164}`;
}

export function useAddCrewMember() {
  const queryClient = useQueryClient();

  return useMutation<CrewAddResult, unknown, CrewMemberInput>({
    mutationFn: async (input) => {
      // Not `request()`: that helper returns the body and throws away the
      // response, and the response status is the answer here. `unwrap` applies
      // the identical error and clock handling, so nothing is skipped — only the
      // status survives the call.
      const result = await getApiClient().POST("/api/v1/partner/crew/", {
        params: {
          header: { "Idempotency-Key": getStableIdempotencyKey(crewAddScope(input.phone_e164)) },
        },
        body: input,
      });

      const member = unwrap(result);
      return { member, wasReinstated: result.response.status === 200 };
    },
    onSuccess: async (_result, input) => {
      clearIdempotencyKey(crewAddScope(input.phone_e164));
      // Re-read rather than append. A reinstatement moves an existing row
      // between two lists, and splicing it into `members` locally would leave
      // the same person in both.
      await queryClient.invalidateQueries({ queryKey: registrationKeys.crew() });
    },
    retry: false,
  });
}

export interface CrewPatchInput {
  readonly membershipId: string;
  readonly patch: CrewMemberPatch;
}

/**
 * Skills and the supervisor flag.
 *
 * `display_name` is deliberately not patchable: it belongs to the global
 * `CrewMember`, which several agencies may share, so one agency renaming a
 * person would rename them on every other roster. The contract publishes it
 * read-only for that reason and the request shape here carries no way to send
 * it.
 */
export function useUpdateCrewMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewPatchInput) =>
      request(() =>
        getApiClient().PATCH("/api/v1/partner/crew/{membership_id}/", {
          params: { path: { membership_id: input.membershipId } },
          body: input.patch,
        }),
      ),
    onSuccess: (member) => {
      applyMember(queryClient, member);
    },
    retry: false,
  });
}

/**
 * Take someone off the roster.
 *
 * Archived, not deleted: the membership keeps its history and re-adding the same
 * person reinstates it. The confirmation on the button says so, because "remove"
 * reads as destructive and a Partner who believes it is would rebuild the entry
 * by hand next season — which is exactly what breaks the same-day double-booking
 * check that global identity exists to provide.
 *
 * `m2_crew_conflict` is documented on this route and **cannot currently be
 * returned**: crew assignment is per stage and the stage model arrives with
 * `M2-BE-522`, so there is no future assignment to consult. Handled anyway, so
 * the day it becomes real the screen already names the assignment rather than
 * silently succeeding on a shift that is now short.
 */
export function useArchiveCrewMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (membershipId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/crew/{membership_id}/archive/", {
          params: { path: { membership_id: membershipId } },
        }),
      ),
    onSuccess: (member) => {
      applyMember(queryClient, member);
    },
    retry: false,
  });
}

function applyMember(
  queryClient: ReturnType<typeof useQueryClient>,
  member: CrewMemberRecord,
): void {
  queryClient.setQueryData<CrewRoster>(registrationKeys.crew(), (roster) =>
    roster
      ? {
          ...roster,
          members: roster.members.map((entry) =>
            entry.membership_id === member.membership_id ? member : entry,
          ),
        }
      : roster,
  );
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/** The roster is not a general address book — it needs an approved capability. */
export function isCrewCapabilityRefusal(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "m2_capability_not_approved" || error.code === "m2_capability_suspended")
  );
}

/** This person is rostered on a day that has not happened yet. */
export function isCrewConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_crew_conflict";
}
