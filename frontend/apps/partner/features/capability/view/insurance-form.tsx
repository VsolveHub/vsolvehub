"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Readout, formatMoney, useT } from "@vsolve/ui";
import { useState } from "react";

import type { InsuranceField, InsuranceProblem, InsuranceView } from "../adapters/insurance";

/**
 * Worker insurance and liability, declared before a workforce capability opens.
 *
 * Closes the presentation half of `M2-FE-106` / `GAP-022`.
 *
 * ## Why this is a declaration and not an upload
 *
 * The policy document goes through the existing document flow. What this screen
 * captures is the *statement* — insurer, policy number, cover, dates — because
 * that is what Operations verifies against and what makes an expiry checkable.
 * A PDF alone tells nobody when the cover ends without a person opening it.
 *
 * ## Declared is not insured, and the screen says so
 *
 * `verified_at` is Operations'. Until it is set, this is an unverified claim,
 * and the badge says "Not checked yet" rather than showing a tick. Rendering an
 * unverified declaration as insured would put a promise in front of a customer
 * that Vsolve has not stood behind, and the person who finds out is a worker
 * who has been hurt.
 *
 * ## Expiry is warned about before it bites
 *
 * The common failure is not a missing policy, it is one that lapses mid-season
 * while a crew is on site. The warning runs off the server clock and appears a
 * month out, which is time to renew rather than notice.
 */

export interface InsuranceFormProps {
  /** The declaration on file, or null when none has been made. */
  readonly current: InsuranceView | null;
  readonly onSubmit: (input: {
    insurerName: string;
    policyReference: string;
    coverageRupees: number;
    coversWorkmenCompensation: boolean;
    validFrom: string;
    validTo: string;
  }) => void;
  /** Client-side certain refusals, computed by the container from the adapter. */
  readonly problems?: readonly InsuranceProblem[];
  /** Field errors the server returned. Take precedence — Django knows more. */
  readonly serverProblems?: readonly InsuranceProblem[];
  readonly pending?: boolean;
  readonly submitError?: string | null;
}

function messageFor(
  field: InsuranceField,
  problems: readonly InsuranceProblem[],
  serverProblems: readonly InsuranceProblem[],
): string | undefined {
  return (
    serverProblems.find((problem) => problem.field === field)?.message ??
    problems.find((problem) => problem.field === field)?.message
  );
}

export function InsuranceForm({
  current,
  onSubmit,
  problems = [],
  serverProblems = [],
  pending = false,
  submitError = null,
}: InsuranceFormProps) {
  const [insurerName, setInsurerName] = useState(current?.insurerName ?? "");
  const [policyReference, setPolicyReference] = useState(current?.policyReference ?? "");
  const [coverageRupees, setCoverageRupees] = useState(
    current ? String(Math.round(current.coveragePaise / 100)) : "",
  );
  const [coversWc, setCoversWc] = useState(current?.coversWorkmenCompensation ?? false);
  const [validFrom, setValidFrom] = useState(current?.validFrom ?? "");
  const [validTo, setValidTo] = useState(current?.validTo ?? "");
  const t = useT();

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-text">{t("apply.steps.insurance")}</h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {t("apply.capability.insuranceForm.intro")}
      </p>

      {current ? <CurrentDeclaration view={current} /> : null}

      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            insurerName,
            policyReference,
            coverageRupees: Number(coverageRupees),
            coversWorkmenCompensation: coversWc,
            validFrom,
            validTo,
          });
        }}
      >
        <Field
          label={t("me.capability.insuranceForm.insurerLabel")}
          error={messageFor("insurer_name", problems, serverProblems)}
          required
        >
          <Input
            value={insurerName}
            onChange={(event) => setInsurerName(event.target.value)}
            autoComplete="organization"
          />
        </Field>

        <Field
          label={t("me.capability.insuranceForm.policyNumberLabel")}
          description={t("me.capability.insuranceForm.policyNumberDescription")}
          error={messageFor("policy_reference", problems, serverProblems)}
          required
        >
          <Input
            value={policyReference}
            onChange={(event) => setPolicyReference(event.target.value)}
          />
        </Field>

        <Field
          label={t("me.capability.insuranceForm.amountCoveredLabel")}
          error={messageFor("coverage_paise", problems, serverProblems)}
          required
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={coverageRupees}
            onChange={(event) => setCoverageRupees(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("me.capability.insuranceForm.coverStartsLabel")}
            error={messageFor("valid_from", problems, serverProblems)}
            required
          >
            <Input
              type="date"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </Field>

          <Field
            label={t("me.capability.insuranceForm.coverEndsLabel")}
            error={messageFor("valid_to", problems, serverProblems)}
            required
          >
            <Input
              type="date"
              value={validTo}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-3 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={coversWc}
            onChange={(event) => setCoversWc(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-action)]"
          />
          <span>
            {t("apply.capability.insuranceForm.wcLabel")}
            <span className="mt-0.5 block text-xs leading-5 text-text-muted">
              {t("me.capability.insuranceForm.wcHelp")}
            </span>
          </span>
        </label>

        {submitError ? (
          <ErrorState
            inline
            title={t("apply.editor.saveFailed.title")}
            message={submitError}
            severity="error"
          />
        ) : null}

        <Button type="submit" loading={pending} loadingLabel={t("common.saving")}>
          {current ? t("me.capability.insuranceForm.updateButton") : t("me.capability.insuranceForm.saveButton")}
        </Button>

        <p className="text-xs leading-5 text-text-muted">
          {t("me.capability.insuranceForm.footerNote")}
        </p>
      </form>
    </Card>
  );
}

function CurrentDeclaration({ view }: { view: InsuranceView }) {
  const t = useT();
  return (
    <div className="mt-4 rounded-card bg-surface-sunken p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Never a tick until Operations has checked it. */}
        <Badge tone={view.isVerified ? "success" : "neutral"}>
          {view.isVerified ? t("me.capability.insuranceForm.checkedBadge") : t("me.capability.insuranceForm.notCheckedBadge")}
        </Badge>
        {view.isExpired ? <Badge tone="danger">{t("me.capability.insuranceForm.expiredBadge")}</Badge> : null}
        {!view.isExpired && view.expiresSoon ? <Badge tone="warning">{t("me.capability.insuranceForm.endingSoonBadge")}</Badge> : null}
      </div>

      <Readout
        className="mt-3"
        size="sm"
        label={t("me.capability.insuranceForm.coverLabel")}
        value={formatMoney(view.coveragePaise)}
        caption={t("me.capability.insuranceForm.coverCaption", { insurer: view.insurerName, validTo: view.validTo })}
      />

      {view.isExpired ? (
        <p className="mt-3 text-sm leading-6 text-danger-text">
          {t("me.capability.insuranceForm.expiredNote")}
        </p>
      ) : view.expiresSoon && view.daysUntilExpiry !== null ? (
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {t("me.capability.insuranceForm.endingSoonTemplate", {
            count: view.daysUntilExpiry,
            days: view.daysUntilExpiry,
          })}
        </p>
      ) : null}
    </div>
  );
}
