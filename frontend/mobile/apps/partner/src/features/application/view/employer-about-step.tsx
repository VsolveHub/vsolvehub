// Ported from frontend/apps/partner/features/application/view/employer-about-step.tsx
import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, useT } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
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
import { EmployerFrame, useEmployerNav, useSignUpName } from "./employer-frame";
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

  useEffect(() => {
    if (application.can_edit && signUpName) {
      setDraft((current) => (current.displayName.trim() ? current : { ...current, displayName: signUpName }));
    }
  }, [application.can_edit, signUpName]);

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
      <Field
        required
        label={t("apply.employer.field.name.label")}
        error={problems.invalid.has("displayName") ? t("apply.employer.field.name.error") : undefined}
      >
        <Input
          autoComplete="name"
          maxLength={120}
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
          value={draft.email}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ email: value })}
        />
      </Field>

      <View style={{ rowGap: 20 }}>
        <Field required label={t("apply.employer.field.area.label")}>
          <Input
            maxLength={120}
            value={draft.area}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ area: value })}
          />
        </Field>
        <Field required label={t("apply.employer.field.city.label")}>
          <Input
            autoComplete="postal-address-locality"
            maxLength={80}
            value={draft.city}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ city: value })}
          />
        </Field>
      </View>

      <Field
        required
        label={t("apply.employer.field.pinCode.label")}
        error={problems.invalid.has("pinCode") ? t("apply.employer.field.pinCode.error") : undefined}
      >
        <Input
          keyboardType="number-pad"
          autoComplete="postal-code"
          maxLength={6}
          value={draft.pinCode}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ pinCode: value.replace(/\D/g, "") })}
        />
      </Field>

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
    </EmployerFrame>
  );
}
