"use client";

import { describeError } from "@vsolve/query";
import { Button, Card, ErrorState, Field, Input, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useState } from "react";

import { asyncStateFrom, type AsyncState } from "@/components/async-section";
import { usePartnerApplication, usePartnerAvailability } from "@/features/application/queries";
import { usePartnerRole } from "@/features/session/use-partner-role";

import {
  certainRefusals,
  fieldsFor,
  missingExpected,
  normalizeForType,
  type BusinessField,
  type BusinessProfileProblem,
} from "../adapters/business-type";
import { describeCapability } from "../adapters/capability-status";
import { describeCapabilityOptions, rupeesToPaise } from "../adapters/capability-options";
import { describeDemand } from "../adapters/demand";
import { describeExpressPath } from "../adapters/express-path";
import { describeInsurance, insuranceProblems } from "../adapters/insurance";
import {
  describeRegistrationPlan,
  type RegistrationPlanView,
} from "../adapters/registration-plan";
import {
  serverFieldProblems,
  toBusinessProfileInput,
  type BusinessProfileInput,
  type BusinessType,
} from "../adapters/wire";
import {
  useCapabilityOptions,
  usePartnerBusinessProfile,
  usePartnerCapabilities,
  usePartnerDemandPreview,
  usePartnerGates,
  usePartnerInsurance,
  useRequestCapability,
  useSaveBusinessProfile,
  useSaveInsurance,
} from "../queries";
import { BusinessTypeChoiceGroup } from "./business-type-choice";
import { CapabilityPicker } from "./capability-picker";
import { CapabilityStatusList, type CapabilityStatusRow } from "./capability-status-list";
import { DemandList } from "./demand-list";
import { ExpressProgress } from "./express-progress";
import { InsuranceForm } from "./insurance-form";
import { RegistrationPlan } from "./registration-plan";

/**
 * The client half of every registration route.
 *
 * Same split, and the same two reasons, as `workspace-screens.tsx`: a route file
 * that held this would have to be `"use client"`, and a `"use client"` route
 * file silently loses `export const dynamic` and `metadata` — which is how these
 * pages would end up prerendered as static, indexable HTML carrying somebody's
 * onboarding state.
 *
 * ## What every screen here has in common
 *
 * The reads that need the Partner role are gated on the session actually holding
 * it. Django grants `partner` when an application is created, so on `/apply`
 * there is a real window in which a signed-in person has none of it, and asking
 * anyway spends a guaranteed `403` on exactly the people these screens exist
 * for.
 *
 * No screen here mounts a fixture. Where a read has not answered, the section
 * shows its real loading state; where it failed, its real failure state; where
 * it succeeded with nothing, the honest empty state for *that* reason.
 */

/* ---------------------------------------------------------------------------
   Shared plumbing
   --------------------------------------------------------------------------- */

function messageOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  return describeError(error, "mutation").message;
}

/* ---------------------------------------------------------------------------
   /apply/capabilities — the registration hub
   --------------------------------------------------------------------------- */

/**
 * Everything a Partner does to be approved for specialist work, on one route.
 *
 * Three sections in the order somebody actually needs them: what is outstanding
 * (`M2-FE-105`), where each request stands (`M2-FE-109`), and what else can be
 * asked for (`M2-FE-104`). Splitting them across three routes would mean the
 * person who came to fix a `CHANGES_REQUIRED` note has to find it first.
 */
export function RegistrationScreen() {
  const role = usePartnerRole();
  const partnerOnly = { enabled: role.isResolved && role.isPartner };

  const application = usePartnerApplication();
  const businessProfile = usePartnerBusinessProfile();
  const options = useCapabilityOptions();
  const capabilities = usePartnerCapabilities(partnerOnly);
  const gates = usePartnerGates(partnerOnly);
  const insurance = usePartnerInsurance();
  const availability = usePartnerAvailability();

  const requestCapability = useRequestCapability();
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);

  /**
   * The plan needs seven reads and must not render until the ones that decide a
   * step have answered — a plan built from half the answers would tell somebody
   * to do something they have already done.
   *
   * `application` is the exception: a `404` is the ordinary "you have not
   * started" state, and waiting for it would strand a brand-new account on a
   * spinner forever.
   */
  const planReadsPending =
    options.isPending ||
    businessProfile.isPending ||
    (partnerOnly.enabled && (capabilities.isPending || gates.isPending)) ||
    insurance.isPending;

  const planState: AsyncState<RegistrationPlanView> = planReadsPending
    ? { status: "loading" }
    : {
        status: "ready",
        data: describeRegistrationPlan({
          application: application.data ?? null,
          businessProfile: businessProfile.data ?? null,
          capabilities: capabilities.data?.capabilities ?? [],
          options: options.data?.capabilities ?? [],
          gates: gates.data?.gates ?? [],
          insurance: insurance.data ?? null,
          // `null`, not an empty schedule: an unread availability must not read
          // as "no hours published", which would demand a step nobody owes.
          schedule: availability.data ?? null,
          serverNow: options.data?.server_now ?? new Date().toISOString(),
        }),
      };

  const serverNow = capabilities.data?.server_now ?? options.data?.server_now ?? "";

  const statusState: AsyncState<readonly CapabilityStatusRow[]> = asyncStateFrom(
    capabilities,
    (list): readonly CapabilityStatusRow[] =>
      list.capabilities.map((record) => ({
        id: record.id,
        variantName: record.variant_name,
        presentation: describeCapability(record, serverNow || list.server_now),
      })),
  );

  const requestError = requestCapability.error;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-text sm:text-2xl">Specialist work</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Supplying a crew by the day, or quoting for a whole project, is reviewed separately from
          ordinary jobs. Asking costs nothing and does not affect the work you already do.
        </p>
      </header>

      <RegistrationPlan
        state={planState}
        onRetry={() => {
          void options.refetch();
          void capabilities.refetch();
          void gates.refetch();
        }}
      />

      <section>
        <h2 className="text-base font-semibold text-text">Where your requests stand</h2>
        <CapabilityStatusList
          className="mt-3"
          state={
            partnerOnly.enabled
              ? statusState
              : // No Partner role yet means no capability can exist. An empty
                // list is the true answer, not a refusal to show one.
                { status: "ready", data: [] }
          }
          onRetry={() => void capabilities.refetch()}
        />
      </section>

      <section>
        <h2 className="text-base font-semibold text-text">Ask to be approved</h2>
        <CapabilityPicker
          className="mt-3"
          state={asyncStateFrom(options, describeCapabilityOptions)}
          pendingVariantId={requestCapability.isPending ? pendingVariantId : null}
          error={
            requestError && pendingVariantId
              ? { variantId: pendingVariantId, message: messageOf(requestError) ?? "" }
              : null
          }
          onRetry={() => void options.refetch()}
          onRequest={({ variantId, asks }) => {
            setPendingVariantId(variantId);
            requestCapability.mutate({
              variant_id: variantId,
              max_crew_size: asks.max_crew_size ?? null,
              // Rupees on screen, paise on the wire. Converted once, here.
              max_project_value_paise:
                asks.max_project_value_paise === undefined
                  ? null
                  : rupeesToPaise(asks.max_project_value_paise),
            });
          }}
        />
      </section>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   /apply/business — business identity
   --------------------------------------------------------------------------- */

const BUSINESS_FIELDS: readonly BusinessField[] = [
  "legal_name",
  "registration_number",
  "gst_registered",
  "gstin",
  "years_in_operation",
];

/**
 * Individual, workforce agency or project vendor — and the fields each carries.
 *
 * Asked for when a Partner applies for specialist work, not at registration:
 * the server defaults everyone to `INDIVIDUAL`, so somebody who never opens this
 * screen still has an answer, and putting it on the four-step path would spend a
 * step on a question most Partners never need to answer differently.
 */
export function BusinessProfileScreen() {
  const profile = usePartnerBusinessProfile();
  const options = useCapabilityOptions();
  const save = useSaveBusinessProfile();

  const [draft, setDraft] = useState<BusinessProfileInput | null>(null);
  const current = draft ?? toBusinessProfileInput(profile.data ?? null);
  const update = (patch: Partial<BusinessProfileInput>) =>
    setDraft(normalizeForType({ ...current, ...patch }));

  const choices = options.data ? describeCapabilityOptions(options.data).businessTypes : [];
  const visible = fieldsFor(current.business_type);
  const refusals = certainRefusals(current);
  const expected = missingExpected(current);
  const serverProblems = serverFieldProblems(save.error, BUSINESS_FIELDS);

  const problemFor = (field: BusinessField): string | undefined =>
    serverProblems.find((entry) => entry.field === field)?.message ??
    refusals.find((entry: BusinessProfileProblem) => entry.field === field)?.message;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-text sm:text-2xl">How you work</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          This decides who signs, who is liable and who the customer pays. We never work it out
          from the services you offer.
        </p>
      </header>

      {options.isPending || profile.isPending ? (
        <p className="text-sm text-text-secondary">Loading your details…</p>
      ) : options.isError ? (
        <ErrorState
          title="We could not load the options"
          message="Nothing you have entered is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void options.refetch()}
        />
      ) : (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (refusals.length > 0) return;
            save.mutate(current);
          }}
        >
          <BusinessTypeChoiceGroup
            choices={choices}
            value={current.business_type}
            disabled={save.isPending}
            onChange={(value: BusinessType) => update({ business_type: value })}
          />

          <Card className="flex flex-col gap-4 p-5">
            {visible.includes("legal_name") ? (
              <Field
                label="Registered business name"
                description="As it appears on your registration, if you have one."
                error={problemFor("legal_name")}
              >
                <Input
                  value={current.legal_name}
                  autoComplete="organization"
                  onChange={(event) => update({ legal_name: event.target.value })}
                />
              </Field>
            ) : null}

            {visible.includes("registration_number") ? (
              <Field
                label="Registration number"
                error={problemFor("registration_number")}
              >
                <Input
                  value={current.registration_number}
                  onChange={(event) => update({ registration_number: event.target.value })}
                />
              </Field>
            ) : null}

            <label className="flex items-start gap-3 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={current.gst_registered}
                onChange={(event) => update({ gst_registered: event.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-action)]"
              />
              <span>I am GST registered</span>
            </label>

            {current.gst_registered ? (
              <Field label="GSTIN" error={problemFor("gstin")}>
                <Input
                  value={current.gstin}
                  onChange={(event) => update({ gstin: event.target.value })}
                />
              </Field>
            ) : null}

            <Field
              label="Years in operation"
              error={problemFor("years_in_operation")}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={String(current.years_in_operation)}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  update({ years_in_operation: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
                }}
              />
            </Field>
          </Card>

          {/* Guidance, never a block. A client rule stricter than the server's
              traps somebody who has actually finished, and a Partner who cannot
              get past this screen has no account at all. */}
          {expected.length > 0 ? (
            <p className="text-sm text-text-secondary">
              An agency or vendor is usually asked for a registered business name. You can save
              without one and add it later.
            </p>
          ) : null}

          {save.isError ? (
            <ErrorState
              inline
              title="We could not save this"
              message={messageOf(save.error) ?? ""}
              severity="error"
            />
          ) : null}

          {save.isSuccess ? (
            <p role="status" className="text-sm font-medium text-success-text">
              Saved.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={save.isPending} loadingLabel="Saving">
              Save
            </Button>
            <Link href="/apply/capabilities" className={buttonStyles({ variant: "ghost" })}>
              Back to specialist work
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   /apply/insurance — worker insurance and liability
   --------------------------------------------------------------------------- */

export function InsuranceScreen() {
  const insurance = usePartnerInsurance();
  const options = useCapabilityOptions();
  const save = useSaveInsurance();

  const [attempted, setAttempted] = useState<
    ReturnType<typeof insuranceProblems> | null
  >(null);

  const serverNow = options.data?.server_now ?? new Date().toISOString();
  const current = insurance.data ? describeInsurance(insurance.data, serverNow) : null;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-text sm:text-2xl">Worker insurance</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Required before workforce capabilities are approved. Operations checks it — until then it
          is a declaration, not cover we have stood behind.
        </p>
      </header>

      {insurance.isPending ? (
        <p className="text-sm text-text-secondary">Loading your declaration…</p>
      ) : insurance.isError ? (
        <ErrorState
          title="We could not load your declaration"
          message="Nothing you have entered is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void insurance.refetch()}
        />
      ) : (
        <InsuranceForm
          current={current}
          problems={attempted ?? []}
          serverProblems={serverFieldProblems(save.error, [
            "insurer_name",
            "policy_reference",
            "coverage_paise",
            "valid_from",
            "valid_to",
          ])}
          pending={save.isPending}
          submitError={save.isError ? messageOf(save.error) : null}
          onSubmit={(input) => {
            const body = {
              insurer_name: input.insurerName,
              policy_reference: input.policyReference,
              // Rupees on screen, paise on the wire.
              coverage_paise: Math.round(input.coverageRupees * 100),
              covers_workmen_compensation: input.coversWorkmenCompensation,
              valid_from: input.validFrom,
              valid_to: input.validTo,
            };
            const problems = insuranceProblems(body);
            setAttempted(problems);
            if (problems.length > 0) return;
            save.mutate(body);
          }}
        />
      )}

      <Link href="/apply/capabilities" className={buttonStyles({ variant: "ghost" })}>
        Back to specialist work
      </Link>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   /apply/demand — masked live demand
   --------------------------------------------------------------------------- */

/**
 * The end of the express path: real work, in the Partner's own area, before they
 * have proved anything.
 *
 * The four-step progress sits above it because somebody who has not finished the
 * path can still reach this route, and an empty demand list would otherwise read
 * as "there is no work here" when the truthful answer is "we do not know where
 * you work yet".
 */
export function DemandScreen() {
  const role = usePartnerRole();
  const enabled = role.isResolved && role.isPartner;

  const application = usePartnerApplication();
  const businessProfile = usePartnerBusinessProfile();
  const demand = usePartnerDemandPreview({ enabled });

  const path = describeExpressPath({
    // Signed in by construction — this route is behind the session shell.
    hasPhone: true,
    application: application.data ?? null,
    businessProfile: businessProfile.data ?? null,
  });

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-text sm:text-2xl">Work near you</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          Live requests from customers in the areas you chose. Names, phone numbers and exact
          addresses stay hidden until a customer invites you.
        </p>
      </header>

      {path.canSeeDemand ? null : <ExpressProgress path={path} />}

      {/*
        No Partner role yet means Django would refuse the read, and a refusal
        rendered as a failure would tell a brand-new applicant something is
        broken. It is not: they have not finished the four steps above, which is
        what the express progress is already saying. A spinner here would be
        worse than both — a disabled query is pending for as long as the tab is
        open.
      */}
      {role.isResolved && !role.isPartner ? (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-text">
            Finish the steps above to see work
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            We match requests against the service and the city you give us. Until we have both,
            there is nothing honest to show you here.
          </p>
        </Card>
      ) : (
        <DemandList
          state={asyncStateFrom(demand, describeDemand)}
          onRetry={() => void demand.refetch()}
        />
      )}
    </section>
  );
}
