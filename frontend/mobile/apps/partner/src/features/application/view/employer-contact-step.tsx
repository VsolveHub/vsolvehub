// Ported from frontend/apps/partner/features/application/view/employer-contact-step.tsx
import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, Text, useT } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import {
  ID_TYPES,
  ROLES,
  canContinue,
  contactDraft,
  contactPatch,
  contactProblems,
  type ContactDraft,
} from "../model/employer-form";
import { useUpdateEmployerDetails } from "../queries";
import { EmployerFrame, useEmployerNav, useSignUpName } from "./employer-frame";
import { EmployerGuard } from "./employer-guard";

type Application = Schemas["PartnerApplication"];

/**
 * "You and your role" for someone hiring for a business: who is posting the jobs, and which ID
 * they will upload. Someone who is not the owner is told an owner's letter will be needed.
 */
export function EmployerContactStep() {
  return (
    <EmployerGuard screen="contact">
      {(application) => <ContactForm key={application.version} application={application} />}
    </EmployerGuard>
  );
}

function ContactForm({ application }: { application: Application }) {
  const t = useT();
  const save = useUpdateEmployerDetails();
  const { goNext } = useEmployerNav(application);
  const { scrollFieldIntoView } = useApplyDock();
  const signUpName = useSignUpName();
  const saved = contactDraft(application.employer, application.display_name);
  const [draft, setDraft] = useState<ContactDraft>(saved);

  useEffect(() => {
    if (application.can_edit && signUpName) {
      setDraft((current) => (current.displayName.trim() ? current : { ...current, displayName: signUpName }));
    }
  }, [application.can_edit, signUpName]);

  const problems = contactProblems(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const change = (patch: Partial<ContactDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  };

  function onContinue() {
    if (!dirty) {
      goNext();
      return;
    }
    save.mutate(contactPatch(draft), { onSuccess: goNext });
  }

  return (
    <EmployerFrame
      application={application}
      title={t("apply.steps.employerContact")}
      description={t("apply.employer.contact.description")}
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

      <Field required label={t("apply.employer.contact.role.label")}>
        <Select
          placeholder={t("apply.employer.contact.role.placeholder")}
          value={draft.role}
          options={ROLES.map((code) => ({
            value: code,
            label: t(`apply.employer.contact.role.${code}`),
          }))}
          onChange={(event) => change({ role: event.target.value })}
        />
      </Field>
      {draft.role !== "" && draft.role !== "OWNER" ? (
        <View accessibilityRole="summary" className="rounded-control bg-surface-sunken p-3">
          <Text className="text-sm text-text">{t("apply.employer.contact.letterNote")}</Text>
        </View>
      ) : null}

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
