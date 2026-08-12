"use client";

import {
  ApiRequestError,
  clearIdempotencyKey,
  getStableIdempotencyKey,
  request,
} from "@vsolve/api-client";
import { SESSION_STATE, VOLATILE_STATE } from "@vsolve/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

import {
  toBusinessProfileWrite,
  type BusinessProfile,
  type BusinessProfileInput,
  type CapabilityList,
  type CapabilityOptions,
  type CapabilityRecord,
  type CapabilityRequestInput,
  type DemandPreview,
  type GateList,
  type InsuranceDeclaration,
  type InsuranceDeclarationInput,
} from "./adapters/wire";

/**
 * The Partner registration surface, wired (contract 1.22.0).
 *
 * `M2-FE-101..106` and `M2-FE-109`. Every path here is one of the thirteen
 * proposal 0013 published on 12 August, so everything goes through the generated
 * client and there is no quarantine left to import.
 *
 * ## Where these keys live, and why not in `m2-keys.ts`
 *
 * `packages/query/src/m2-keys.ts` is frozen for the running sessions and carries
 * keys for seven domains — none of which is the registration surface. It was
 * written from proposal 0012, which deliberately stops at the workspace read;
 * proposal 0013 is everything a Partner does *before* that endpoint can answer,
 * and it landed afterwards.
 *
 * So the keys are declared here, under the same `["m2", …]` root so a
 * whole-domain invalidation still reaches them, and the addition is requested in
 * `frontend-execution-plan.md` §7 for the integrator to land. Building against
 * the current shape rather than editing a frozen module is the rule; this is it.
 *
 * ## Which reads need the Partner role, and which do not
 *
 * `/capability-options/`, `/business-profile/` and `/insurance/` answer any
 * authenticated account, because a person who has not applied yet holds no
 * `partner` role and proposal 0013's first constraint is that **no gate stands
 * before browsing demand**. `/capabilities/`, `/gates/`, `/crew/` and
 * `/demand-preview/` need the role.
 *
 * Every hook therefore takes `enabled`, and the containers pass the session's
 * own answer. Asking anyway would spend a guaranteed 403 on every visit to
 * `/apply` — which is exactly where the person who does not have the role is.
 *
 * ## Absence is not an error
 *
 * `GET /business-profile/` and `GET /insurance/` answer `404` when nothing is
 * declared, and that is the ordinary state for every M1 Partner. Both hooks turn
 * it into `null` rather than an error, because a red card on "you have not filled
 * this in yet" is how a person concludes something is broken and stops.
 */

/* ---------------------------------------------------------------------------
   Keys
   --------------------------------------------------------------------------- */

const REGISTRATION_ROOT = ["m2", "registration"] as const;

export const registrationKeys = {
  all: REGISTRATION_ROOT,
  businessProfile: () => [...REGISTRATION_ROOT, "business-profile"] as const,
  capabilityOptions: () => [...REGISTRATION_ROOT, "capability-options"] as const,
  capabilities: () => [...REGISTRATION_ROOT, "capabilities"] as const,
  insurance: () => [...REGISTRATION_ROOT, "insurance"] as const,
  gates: () => [...REGISTRATION_ROOT, "gates"] as const,
  demandPreview: () => [...REGISTRATION_ROOT, "demand-preview"] as const,
  crew: () => [...REGISTRATION_ROOT, "crew"] as const,
} as const;

/* ---------------------------------------------------------------------------
   Shared refusal handling
   --------------------------------------------------------------------------- */

/**
 * A refused read is not retried.
 *
 * 401/403 means the session does not hold the role this endpoint needs, and
 * asking twice walks into the same refusal while delaying the honest screen.
 * 404 on these two reads means "nothing declared", which no retry will change.
 */
function retryRead(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) return false;
  return failureCount < 2;
}

function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export interface EnabledOption {
  readonly enabled?: boolean;
}

/* ---------------------------------------------------------------------------
   A. Business identity
   --------------------------------------------------------------------------- */

/**
 * The Partner's declared business identity, or `null` when none exists.
 *
 * The `404` is folded into the success path deliberately: an M1 Partner has no
 * `PartnerBusinessProfile` row and never will until they choose one, and the
 * business-type screen's whole job is to offer the choice rather than report its
 * absence.
 */
export function usePartnerBusinessProfile(options: EnabledOption = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<BusinessProfile | null>({
    queryKey: registrationKeys.businessProfile(),
    queryFn: async () => {
      try {
        return await request(() => getApiClient().GET("/api/v1/partner/business-profile/"));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    enabled,
    ...SESSION_STATE,
    retry: retryRead,
  });
}

/**
 * Create or replace the whole profile.
 *
 * A `PUT`, matching the contract: the three business types have genuinely
 * different required fields, and a partial update is how somebody switching from
 * agency to individual keeps a registration number the check constraint forbids.
 * `normalizeForType` in the adapter clears the fields the new type does not
 * carry, so the body cannot smuggle one through.
 */
export function useSaveBusinessProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BusinessProfileInput) =>
      request(() =>
        getApiClient().PUT("/api/v1/partner/business-profile/", {
          body: toBusinessProfileWrite(input),
        }),
      ),
    onSuccess: async (profile) => {
      queryClient.setQueryData(registrationKeys.businessProfile(), profile);
      // The options list carries the business-type copy and, on a newer
      // deployment, could carry eligibility that depends on the type.
      await queryClient.invalidateQueries({ queryKey: registrationKeys.capabilityOptions() });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   B. Capability options and records
   --------------------------------------------------------------------------- */

/**
 * What this Partner may ask to be approved for.
 *
 * A catalog read scoped to eligibility, not a gate: it answers for an account
 * with no application, no documents and no capability, which is proposal 0013's
 * first acceptance criterion and the reason the express path can end somewhere
 * useful.
 */
export function useCapabilityOptions(options: EnabledOption = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<CapabilityOptions>({
    queryKey: registrationKeys.capabilityOptions(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/capability-options/")),
    enabled,
    ...SESSION_STATE,
    retry: retryRead,
  });
}

/**
 * Every capability this Partner holds, in any status.
 *
 * The read that separates "not applied" from "under review" from "suspended" —
 * an empty workspace-grant list cannot, and inferring a review banner from one
 * would show it to every existing M1 Partner.
 *
 * `SESSION_STATE`, so an approval or a suspension applied by Operations lands on
 * the next window focus rather than at the next login. Same tier and same reason
 * as the workspace grants it sits beside.
 */
export function usePartnerCapabilities(options: EnabledOption = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<CapabilityList>({
    queryKey: registrationKeys.capabilities(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/capabilities/")),
    enabled,
    ...SESSION_STATE,
    retry: retryRead,
  });
}

/** One stable key per variant, for the life of that logical request. */
function capabilityRequestScope(variantId: string): string {
  return `m2-capability:request:${variantId}`;
}

/**
 * Ask to be approved for a lifecycle capability.
 *
 * Idempotent under a key scoped to the variant, so a double tap, a timeout or a
 * refresh replays the original result rather than colliding with
 * `partners_unique_live_capability_per_variant`. The key is cleared on success
 * only: clearing it on failure would mint a new one for the Partner's own retry
 * and defeat the idempotency it exists for.
 *
 * Never retried automatically. `m2_capability_already_requested` and
 * `idempotency_in_progress` are both decisions, and resending under a fresh key
 * is precisely what the contract tells clients not to do.
 */
export function useRequestCapability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CapabilityRequestInput) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/capabilities/", {
          params: {
            header: {
              "Idempotency-Key": getStableIdempotencyKey(
                capabilityRequestScope(input.variant_id),
              ),
            },
          },
          body: input,
        }),
      ),
    onSuccess: async (_record, input) => {
      clearIdempotencyKey(capabilityRequestScope(input.variant_id));
      await Promise.all([
        // `already_requested` on the options list is now stale by construction.
        queryClient.invalidateQueries({ queryKey: registrationKeys.capabilityOptions() }),
        queryClient.invalidateQueries({ queryKey: registrationKeys.capabilities() }),
        queryClient.invalidateQueries({ queryKey: registrationKeys.gates() }),
      ]);
    },
    retry: false,
  });
}

/**
 * The Partner's own exit from a capability.
 *
 * Distinct from Operations' `REJECTED`, which this route cannot reach and the
 * Partner cannot cause. Neither status blocks a fresh request for the same
 * variant, so the options list is invalidated too — the card that was disabled
 * as "already asked" becomes askable again.
 */
export function useWithdrawCapability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (capabilityId: string) =>
      request(() =>
        getApiClient().POST("/api/v1/partner/capabilities/{capability_id}/withdraw/", {
          params: { path: { capability_id: capabilityId } },
        }),
      ),
    onSuccess: async (record: CapabilityRecord) => {
      queryClient.setQueryData<CapabilityList>(registrationKeys.capabilities(), (list) =>
        list
          ? {
              ...list,
              capabilities: list.capabilities.map((entry) =>
                entry.id === record.id ? record : entry,
              ),
            }
          : list,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: registrationKeys.capabilityOptions() }),
        // Withdrawing an approved capability takes its workspace away, and the
        // shell reads that from a different endpoint.
        queryClient.invalidateQueries({ queryKey: ["m2", "workspace"] }),
      ]);
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   C. Worker insurance
   --------------------------------------------------------------------------- */

/** The declaration on file, or `null` when none has been made. */
export function usePartnerInsurance(options: EnabledOption = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<InsuranceDeclaration | null>({
    queryKey: registrationKeys.insurance(),
    queryFn: async () => {
      try {
        return await request(() => getApiClient().GET("/api/v1/partner/insurance/"));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    enabled,
    ...SESSION_STATE,
    retry: retryRead,
  });
}

/**
 * Declare or re-declare worker insurance.
 *
 * Re-declaring clears `verified_at` server-side, which is correct and worth
 * knowing: a new policy is a new claim nobody has checked, and carrying the old
 * verification forward would show a customer a tick against cover Vsolve has not
 * seen. The screen therefore reads `verified_at` back from the response rather
 * than assuming it survived.
 */
export function useSaveInsurance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InsuranceDeclarationInput) =>
      request(() => getApiClient().PUT("/api/v1/partner/insurance/", { body: input })),
    onSuccess: async (declaration) => {
      queryClient.setQueryData(registrationKeys.insurance(), declaration);
      await queryClient.invalidateQueries({ queryKey: registrationKeys.capabilities() });
    },
    retry: false,
  });
}

/* ---------------------------------------------------------------------------
   D. Progressive gates and masked demand
   --------------------------------------------------------------------------- */

/**
 * The three progressive gates and the server's own sentence for each.
 *
 * **Advisory, and the client must treat it as such.** Django enforces these at
 * the moment of the command; this decides only what the UI explains *before* the
 * attempt. A client that treated it as authoritative would block somebody whose
 * KYC completed thirty seconds ago and admit somebody suspended thirty seconds
 * ago. Every command still handles the `403` arriving anyway.
 *
 * `VOLATILE_STATE`: a gate can be cleared on another screen — a document
 * approved, a bank account added — and an explanation for an obligation the
 * Partner has already met is the one thing that makes this read feel wrong.
 */
export function usePartnerGates(options: EnabledOption = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<GateList>({
    queryKey: registrationKeys.gates(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/gates/")),
    enabled,
    ...VOLATILE_STATE,
    retry: retryRead,
  });
}

/**
 * Masked live demand — the end of the express path.
 *
 * `VOLATILE_STATE` because this is a list of live requirements that other
 * vendors are being invited to answer, and an hour-old copy shown as "work near
 * you" is the marketplace's first impression built on something that has already
 * been filled.
 *
 * An empty list is a real answer, never an error: the screen says "nothing in
 * your area right now" and the adapter separates that from "nothing matched your
 * services", which is a different problem with a different fix.
 */
export function usePartnerDemandPreview(options: EnabledOption = {}) {
  const enabled = options.enabled ?? true;

  return useQuery<DemandPreview>({
    queryKey: registrationKeys.demandPreview(),
    queryFn: () => request(() => getApiClient().GET("/api/v1/partner/demand-preview/")),
    enabled,
    ...VOLATILE_STATE,
    retry: retryRead,
  });
}

/* ---------------------------------------------------------------------------
   Refusals worth naming
   --------------------------------------------------------------------------- */

/** A live request already exists for this variant. Open it, do not start another. */
export function isCapabilityAlreadyRequested(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_capability_already_requested";
}

/** The variant carries no A3/A5 configuration. Not a field error — a coverage gap. */
export function isLifecycleUnsupported(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_lifecycle_not_supported";
}

/** A transition this status cannot make. Terminal states refuse a second withdrawal. */
export function isTransitionNotAllowed(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && error.code === "m2_capability_transition_not_allowed"
  );
}

/** A business-type constraint the database enforces. Belongs under a field. */
export function isBusinessTypeInvalid(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "m2_business_type_invalid";
}

/** A same-key request is still running. Wait and re-read; never resend. */
export function isCommandInProgress(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "idempotency_in_progress";
}
