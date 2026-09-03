"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
  unwrap,
  type Schemas,
} from "@vsolve/api-client";
import { SESSION_STATE } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";
import { registrationKeys } from "@/features/capability/queries";
import {
  isUploadExpired,
  sha256Hex,
  type UploadProgress,
} from "@/features/application/model/upload";
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
 * The name this agency uses, their skills, the supervisor flag and gender
 * (contract 1.58.0).
 *
 * `display_name` writes a **per-roster label**, never the shared `CrewMember`.
 * It used to be unpatchable for a real reason — the global row is shared by
 * every agency that resolved to the same number — but that left a typo with no
 * way out at all: archiving and re-adding resolves by `identity_hash` and hands
 * back the same wrong name. The label is per-membership, so correcting it here
 * cannot touch another agency's roster. Sending `""` clears the override.
 *
 * The mobile number stays unpatchable, and that one is not a gap. It *is* the
 * identity: it is hashed to resolve one person across every agency roster, which
 * is what makes the same-day double-booking check possible. A different number
 * is a different person, and the way to record one is to add them.
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

/* ---------------------------------------------------------------------------
   Identity documents (contract 1.58.0)
   --------------------------------------------------------------------------- */

export type CrewDocumentKind = Schemas["CrewDocumentKindEnum"];

export interface CrewDocumentUploadInput {
  readonly membershipId: string;
  readonly kind: CrewDocumentKind;
  readonly file: File;
  readonly onProgress?: (progress: UploadProgress) => void;
}

/**
 * Upload one identity document for one worker.
 *
 * The same three-step shape as the KYC upload — hash, signed PUT straight to
 * storage, confirm — and it reuses that feature's helpers rather than growing a
 * second copy of them. Kept as one mutation for the same reason: an upload
 * requested and never confirmed is an orphan the server has to sweep up, and a
 * caller able to invoke the steps separately would eventually leave one behind.
 *
 * ## Why the bytes are hashed here and not just sent
 *
 * The digest is declared before the transfer and Django streams the stored
 * object back to compare it. Without that, "the upload succeeded" is a claim
 * made by the party who benefits from it, and what reaches a reviewer is
 * whatever actually landed in the bucket. A mismatch fails here rather than at
 * somebody's desk.
 *
 * Nothing is retried automatically. Both the transfer and the confirm are
 * expensive enough that a second attempt should be a deliberate press.
 */
export function useUploadCrewDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CrewDocumentUploadInput) => {
      const report = (progress: UploadProgress) => input.onProgress?.(progress);

      report({ phase: "hashing", percent: 0 });
      const sha256 = await sha256Hex(input.file);

      report({ phase: "requesting", percent: 0 });
      const grant = await request(() =>
        getApiClient().POST("/api/v1/partner/crew/{membership_id}/documents/", {
          params: { path: { membership_id: input.membershipId } },
          body: {
            kind: input.kind,
            content_type: input.file.type,
            size_bytes: input.file.size,
            sha256,
          },
        }),
      );

      // A deadline already past means the clock or the round trip is badly off;
      // sending bytes at it would waste the whole transfer.
      if (isUploadExpired(grant.expires_at)) {
        throw new Error("That upload link expired before it was used.");
      }

      report({ phase: "uploading", percent: 0 });
      await putSignedBytes(grant.upload_url, input.file, (percent) =>
        report({ phase: "uploading", percent }),
      );

      report({ phase: "finalizing", percent: 100 });
      const member = await request(() =>
        getApiClient().PUT("/api/v1/partner/crew/{membership_id}/documents/", {
          params: { path: { membership_id: input.membershipId } },
          body: { document_id: grant.document_id },
        }),
      );

      report({ phase: "done", percent: 100 });
      return member;
    },
    onSuccess: (member) => {
      applyMember(queryClient, member);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: registrationKeys.crew() });
    },
    retry: false,
  });
}

/**
 * PUTs the bytes to storage, reporting progress. Resolves on a 2xx only.
 *
 * `XMLHttpRequest` rather than `fetch` for the same reason the KYC upload uses
 * it: no shipping browser reports progress for a `fetch` request body, and a
 * photograph of an ID card over a site connection is exactly where a progress
 * bar is the difference between waiting and tapping again.
 */
function putSignedBytes(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Storage refused the upload (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The upload could not reach storage."));
    xhr.onabort = () => reject(new Error("The upload was cancelled."));
    xhr.send(file);
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
