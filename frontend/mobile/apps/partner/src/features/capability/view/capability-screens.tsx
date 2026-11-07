// Ported from frontend/apps/partner/features/capability/view/capability-screens.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Card, ErrorState, Field, Input, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

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
import { describeRegistrationPlan, type RegistrationPlanView } from "../adapters/registration-plan";
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

function messageOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  return describeError(error, "mutation").message;
}

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
    <View className="flex-col gap-6">
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          Specialist work
        </Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          Supplying a crew by the day, or quoting for a whole project, is reviewed separately from ordinary jobs.
          Asking costs nothing and does not affect the work you already do.
        </Text>
      </View>

      <RegistrationPlan
        state={planState}
        onRetry={() => {
          void options.refetch();
          void capabilities.refetch();
          void gates.refetch();
        }}
      />

      <View>
        <Text className="text-base font-semibold text-text">Where your requests stand</Text>
        <CapabilityStatusList
          className="mt-3"
          state={partnerOnly.enabled ? statusState : { status: "ready", data: [] }}
          onRetry={() => void capabilities.refetch()}
        />
      </View>

      <View>
        <Text className="text-base font-semibold text-text">Ask to be approved</Text>
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
          onRequest={({ variantId, asks, answers }) => {
            setPendingVariantId(variantId);
            requestCapability.mutate({
              variant_id: variantId,
              max_crew_size: asks.max_crew_size ?? null,
              max_project_value_paise:
                asks.max_project_value_paise === undefined
                  ? null
                  : rupeesToPaise(asks.max_project_value_paise),
              registration_answers: answers,
            });
          }}
        />
      </View>
    </View>
  );
}

const BUSINESS_FIELDS: readonly BusinessField[] = [
  "legal_name",
  "registration_number",
  "gst_registered",
  "gstin",
  "years_in_operation",
];

export function BusinessProfileScreen() {
  const router = useRouter();
  const profile = usePartnerBusinessProfile();
  const options = useCapabilityOptions();
  const save = useSaveBusinessProfile();

  const [draft, setDraft] = useState<BusinessProfileInput | null>(null);
  const current = draft ?? toBusinessProfileInput(profile.data ?? null);
  const update = (patch: Partial<BusinessProfileInput>) => setDraft(normalizeForType({ ...current, ...patch }));

  const choices = options.data ? describeCapabilityOptions(options.data).businessTypes : [];
  const visible = fieldsFor(current.business_type);
  const refusals = certainRefusals(current);
  const expected = missingExpected(current);
  const serverProblems = serverFieldProblems(save.error, BUSINESS_FIELDS);

  const problemFor = (field: BusinessField): string | undefined =>
    serverProblems.find((entry) => entry.field === field)?.message ??
    refusals.find((entry: BusinessProfileProblem) => entry.field === field)?.message;

  return (
    <View className="flex-col gap-6">
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          How you work
        </Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          This decides who signs, who is liable and who the customer pays. We never work it out from the services
          you offer.
        </Text>
      </View>

      {options.isPending || profile.isPending ? (
        <Text className="text-sm text-text-secondary">Loading your details…</Text>
      ) : options.isError ? (
        <ErrorState
          title="We could not load the options"
          message="Nothing you have entered is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void options.refetch()}
        />
      ) : (
        <View className="flex-col gap-6">
          <BusinessTypeChoiceGroup
            choices={choices}
            value={current.business_type}
            disabled={save.isPending}
            onChange={(value: BusinessType) => update({ business_type: value })}
          />

          <Card className="flex-col gap-4 p-5">
            {visible.includes("legal_name") ? (
              <Field
                label="Registered business name"
                description="As it appears on your registration, if you have one."
                error={problemFor("legal_name")}
              >
                <Input value={current.legal_name} autoComplete="organization" onChangeText={(value) => update({ legal_name: value })} />
              </Field>
            ) : null}

            {visible.includes("registration_number") ? (
              <Field label="Registration number" error={problemFor("registration_number")}>
                <Input
                  value={current.registration_number}
                  onChangeText={(value) => update({ registration_number: value })}
                />
              </Field>
            ) : null}

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: current.gst_registered }}
              onPress={() => update({ gst_registered: !current.gst_registered })}
              className="flex-row items-start gap-3"
            >
              <View
                className={
                  current.gst_registered
                    ? "mt-0.5 h-5 w-5 items-center justify-center rounded border border-action bg-action"
                    : "mt-0.5 h-5 w-5 rounded border border-line-strong"
                }
              >
                {current.gst_registered ? <Text className="text-xs text-action-text">✓</Text> : null}
              </View>
              <Text className="text-sm text-text-secondary">I am GST registered</Text>
            </Pressable>

            {current.gst_registered ? (
              <Field label="GSTIN" error={problemFor("gstin")}>
                <Input value={current.gstin} onChangeText={(value) => update({ gstin: value })} />
              </Field>
            ) : null}

            <Field label="Years in operation" error={problemFor("years_in_operation")}>
              <Input
                keyboardType="number-pad"
                value={String(current.years_in_operation)}
                onChangeText={(value) => {
                  const parsed = Number.parseInt(value, 10);
                  update({ years_in_operation: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
                }}
              />
            </Field>
          </Card>

          {expected.length > 0 ? (
            <Text className="text-sm text-text-secondary">
              An agency or vendor is usually asked for a registered business name. You can save without one and add
              it later.
            </Text>
          ) : null}

          {save.isError ? (
            <ErrorState inline title="We could not save this" message={messageOf(save.error) ?? ""} severity="error" />
          ) : null}

          {save.isSuccess ? (
            <Text accessibilityLiveRegion="polite" className="text-sm font-medium text-success-text">
              Saved.
            </Text>
          ) : null}

          <View className="flex-row flex-wrap gap-3">
            <Button
              loading={save.isPending}
              loadingLabel="Saving"
              onPress={() => {
                if (refusals.length > 0) return;
                save.mutate(current);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" onPress={() => router.push("/apply/capabilities")}>
              Back to specialist work
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

export function InsuranceScreen() {
  const router = useRouter();
  const insurance = usePartnerInsurance();
  const options = useCapabilityOptions();
  const save = useSaveInsurance();

  const [attempted, setAttempted] = useState<ReturnType<typeof insuranceProblems> | null>(null);

  const serverNow = options.data?.server_now ?? new Date().toISOString();
  const current = insurance.data ? describeInsurance(insurance.data, serverNow) : null;

  return (
    <View className="flex-col gap-6">
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          Worker insurance
        </Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          Required before workforce capabilities are approved. Operations checks it — until then it is a
          declaration, not cover we have stood behind.
        </Text>
      </View>

      {insurance.isPending ? (
        <Text className="text-sm text-text-secondary">Loading your declaration…</Text>
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

      <Button variant="ghost" onPress={() => router.push("/apply/capabilities")}>
        Back to specialist work
      </Button>
    </View>
  );
}

export function DemandScreen() {
  const role = usePartnerRole();
  const enabled = role.isResolved && role.isPartner;

  const application = usePartnerApplication();
  const businessProfile = usePartnerBusinessProfile();
  const demand = usePartnerDemandPreview({ enabled });

  const path = describeExpressPath({
    hasPhone: true,
    application: application.data ?? null,
    businessProfile: businessProfile.data ?? null,
  });

  return (
    <View className="flex-col gap-6">
      <View>
        <Text accessibilityRole="header" className="text-xl font-bold text-text">
          Work near you
        </Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          Live requests from customers in the areas you chose. Names, phone numbers and exact addresses stay hidden
          until a customer invites you.
        </Text>
      </View>

      {path.canSeeDemand ? null : <ExpressProgress path={path} />}

      {role.isResolved && !role.isPartner ? (
        <Card className="p-5">
          <Text className="text-base font-semibold text-text">Finish the steps above to see work</Text>
          <Text className="mt-1 text-sm leading-6 text-text-secondary">
            We match requests against the service and the city you give us. Until we have both, there is nothing
            honest to show you here.
          </Text>
        </Card>
      ) : (
        <DemandList state={asyncStateFrom(demand, describeDemand)} onRetry={() => void demand.refetch()} />
      )}
    </View>
  );
}
