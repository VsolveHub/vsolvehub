// Ported from frontend/apps/partner/features/capability/view/insurance-form.tsx
import { Badge, Button, Card, ErrorState, Field, Input, Readout, Text, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { InsuranceField, InsuranceProblem, InsuranceView } from "../adapters/insurance";

export interface InsuranceFormProps {
  readonly current: InsuranceView | null;
  readonly onSubmit: (input: {
    insurerName: string;
    policyReference: string;
    coverageRupees: number;
    coversWorkmenCompensation: boolean;
    validFrom: string;
    validTo: string;
  }) => void;
  readonly problems?: readonly InsuranceProblem[];
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

  return (
    <Card className="p-5">
      <Text className="text-base font-semibold text-text">Worker insurance</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        You are sending people onto someone else’s site. This is who covers them if something goes wrong there.
      </Text>

      {current ? <CurrentDeclaration view={current} /> : null}

      <View className="mt-5 flex-col gap-4">
        <Field label="Insurer" error={messageFor("insurer_name", problems, serverProblems)} required>
          <Input value={insurerName} onChangeText={setInsurerName} autoComplete="organization" />
        </Field>
        <Field
          label="Policy number"
          description="Exactly as it appears on the document."
          error={messageFor("policy_reference", problems, serverProblems)}
          required
        >
          <Input value={policyReference} onChangeText={setPolicyReference} />
        </Field>
        <Field label="Amount covered (₹)" error={messageFor("coverage_paise", problems, serverProblems)} required>
          <Input keyboardType="number-pad" value={coverageRupees} onChangeText={setCoverageRupees} />
        </Field>
        <Field label="Cover starts" error={messageFor("valid_from", problems, serverProblems)} required>
          <Input value={validFrom} placeholder="YYYY-MM-DD" onChangeText={setValidFrom} />
        </Field>
        <Field label="Cover ends" error={messageFor("valid_to", problems, serverProblems)} required>
          <Input value={validTo} placeholder="YYYY-MM-DD" onChangeText={setValidTo} />
        </Field>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: coversWc }}
          onPress={() => setCoversWc((currentValue) => !currentValue)}
          className="flex-row items-start gap-3"
        >
          <View
            className={
              coversWc
                ? "mt-0.5 h-5 w-5 items-center justify-center rounded border border-action bg-action"
                : "mt-0.5 h-5 w-5 rounded border border-line-strong"
            }
          >
            {coversWc ? <Text className="text-xs text-action-text">✓</Text> : null}
          </View>
          <View className="flex-1">
            <Text className="text-sm text-text-secondary">This policy includes workmen’s compensation.</Text>
            <Text className="mt-0.5 text-xs leading-5 text-text-muted">
              Some construction and industrial work cannot be approved without it.
            </Text>
          </View>
        </Pressable>

        {submitError ? (
          <ErrorState inline title="We could not save this" message={submitError} severity="error" />
        ) : null}

        <Button
          loading={pending}
          loadingLabel="Saving"
          onPress={() =>
            onSubmit({
              insurerName,
              policyReference,
              coverageRupees: Number(coverageRupees),
              coversWorkmenCompensation: coversWc,
              validFrom,
              validTo,
            })
          }
        >
          {current ? "Update declaration" : "Save declaration"}
        </Button>
        <Text className="text-xs leading-5 text-text-muted">
          We check this before approving workforce capabilities. Saying you are covered when you are not is grounds
          for suspension.
        </Text>
      </View>
    </Card>
  );
}

function CurrentDeclaration({ view }: { view: InsuranceView }) {
  return (
    <View className="mt-4 rounded-card bg-surface-sunken p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge tone={view.isVerified ? "success" : "neutral"}>{view.isVerified ? "Checked" : "Not checked yet"}</Badge>
        {view.isExpired ? <Badge tone="danger">Expired</Badge> : null}
        {!view.isExpired && view.expiresSoon ? <Badge tone="warning">Ending soon</Badge> : null}
      </View>
      <Readout
        className="mt-3"
        size="sm"
        label="Cover"
        value={formatMoney(view.coveragePaise)}
        caption={`${view.insurerName} · ends ${view.validTo}`}
      />
      {view.isExpired ? (
        <Text className="mt-3 text-sm leading-6 text-danger-text">
          This cover has ended. Workforce enquiries stop reaching you until it is renewed.
        </Text>
      ) : view.expiresSoon && view.daysUntilExpiry !== null ? (
        <Text className="mt-3 text-sm leading-6 text-text-secondary">
          Ends in {view.daysUntilExpiry} {view.daysUntilExpiry === 1 ? "day" : "days"}. Renew it before then so your
          work is not interrupted.
        </Text>
      ) : null}
    </View>
  );
}
