// Ported from frontend/apps/partner/features/application/view/employer-about-step.tsx
import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, Text, useT } from "@vsolve/mobile-ui";
import { ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import {
  ID_TYPES,
  canContinue,
  individualDraft,
  individualPatch,
  individualProblems,
  type IndividualDraft,
} from "../model/employer-form";
import { useUpdateEmployerDetails } from "../queries";
import { EmployerFrame, FormSection, useEmployerNav, useSignUpName } from "./employer-frame";
import { EmployerGuard } from "./employer-guard";

type Application = Schemas["PartnerApplication"];

/**
 * "Your details" for someone hiring for themselves: their name, where they are, and which ID they
 * will upload. Candidates see a short name and the area only; the pin code and the ID stay private.
 */
export function EmployerAboutStep() {
  return (
    <EmployerGuard screen="about">
      {(application) => <AboutForm key={application.version} application={application} />}
    </EmployerGuard>
  );
}

function AboutForm({ application }: { application: Application }) {
  const t = useT();
  const save = useUpdateEmployerDetails();
  const { goNext } = useEmployerNav(application);
  const { scrollFieldIntoView } = useApplyDock();
  const signUpName = useSignUpName();
  const saved = individualDraft(application.employer, application.display_name);
  const [draft, setDraft] = useState<IndividualDraft>(saved);

  // Offer the sign-up name once (and again only if it changes), never on every empty field.
  const prefillKey = application.can_edit && signUpName ? signUpName : "";
  const [prevPrefillKey, setPrevPrefillKey] = useState("");
  if (prefillKey !== prevPrefillKey) {
    setPrevPrefillKey(prefillKey);
    if (prefillKey) {
      setDraft((current) => (current.displayName.trim() ? current : { ...current, displayName: prefillKey }));
    }
  }

  const problems = individualProblems(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const change = (patch: Partial<IndividualDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  };

  function onContinue() {
    if (!dirty) {
      goNext();
      return;
    }
    save.mutate(individualPatch(draft), { onSuccess: goNext });
  }

  return (
    <EmployerFrame
      application={application}
      title={t("apply.steps.employerAbout")}
      description={t("apply.employer.about.description")}
      canContinue={canContinue(problems)}
      saving={save.isPending}
      error={save.error}
      onContinue={onContinue}
    >
      <FormSection title="Personal information">
        <Field
          required
          label={t("apply.employer.field.name.label")}
          error={problems.invalid.has("displayName") ? t("apply.employer.field.name.error") : undefined}
        >
          <Input
            autoComplete="name"
            maxLength={120}
            placeholder="e.g. Ramesh Kumar"
            value={draft.displayName}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ displayName: value })}
          />
        </Field>

        <Field
          label={t("apply.employer.field.email.label")}
          error={problems.invalid.has("email") ? t("apply.employer.field.email.error") : undefined}
        >
          <Input
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            maxLength={254}
            placeholder="e.g. ramesh@example.com"
            value={draft.email}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ email: value })}
          />
        </Field>
      </FormSection>

      <FormSection title="Location">
        <Field required label={t("apply.employer.field.area.label")}>
          <Input
            maxLength={120}
            placeholder="e.g. Kondapur"
            value={draft.area}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ area: value })}
          />
        </Field>

        <Field required label={t("apply.employer.field.city.label")}>
          <Input
            autoComplete="postal-address-locality"
            maxLength={80}
            placeholder="e.g. Hyderabad"
            value={draft.city}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ city: value })}
          />
        </Field>

        <Field
          required
          label={t("apply.employer.field.pinCode.label")}
          error={problems.invalid.has("pinCode") ? t("apply.employer.field.pinCode.error") : undefined}
        >
          <Input
            keyboardType="number-pad"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="500084"
            value={draft.pinCode}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ pinCode: value.replace(/\D/g, "") })}
          />
        </Field>
      </FormSection>

      <FormSection title="Identity verification">
        <Field required label={t("apply.employer.field.idType.label")}>
          <Select
            placeholder={t("apply.employer.field.idType.placeholder")}
            value={draft.idType}
            options={ID_TYPES.map((code) => ({
              value: code,
              label: t(`apply.employer.field.idType.${code}`),
            }))}
            onChange={(event) => change({ idType: event.target.value })}
          />
        </Field>

        <View className="flex-row items-start gap-3 rounded-control bg-surface-sunken p-4">
          <ShieldCheck size={16} color="#16a34a" className="mt-0.5 shrink-0" />
          <View className="flex-1 gap-0.5">
            <Text className="font-semibold text-xs text-text">Your details stay private</Text>
            <Text className="text-xs text-text-secondary leading-5">
              Your street address, pin code, and ID documents are strictly verified by Operations and never shown on public job listings.
            </Text>
          </View>
        </View>
      </FormSection>
    </EmployerFrame>
  );
}
