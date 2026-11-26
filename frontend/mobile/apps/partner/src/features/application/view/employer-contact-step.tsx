// Ported from frontend/apps/partner/features/application/view/employer-contact-step.tsx
import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, Text, useT } from "@vsolve/mobile-ui";
import { Building2, FileText, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
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
import { EmployerFrame, FormSection, useEmployerNav, useSignUpName } from "./employer-frame";
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

  // Offer the sign-up name once (and again only if it changes), never on every empty field.
  const prefillKey = application.can_edit && signUpName ? signUpName : "";
  const [prevPrefillKey, setPrevPrefillKey] = useState("");
  if (prefillKey !== prevPrefillKey) {
    setPrevPrefillKey(prefillKey);
    if (prefillKey) {
      setDraft((current) => (current.displayName.trim() ? current : { ...current, displayName: prefillKey }));
    }
  }

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

  const companyName =
    application.employer?.business?.trade_name ||
    application.employer?.business?.legal_name ||
    "";

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
      {companyName ? (
        <View className="flex-row items-center gap-2.5 rounded-control bg-surface-sunken px-4 py-3">
          <Building2 size={16} color="#0055ff" />
          <Text className="text-sm text-text-secondary">
            Hiring representative for <Text className="font-bold text-text">{companyName}</Text>
          </Text>
        </View>
      ) : null}

      <FormSection title="Your details">
        <Field
          required
          label={t("apply.employer.field.name.label")}
          error={problems.invalid.has("displayName") ? t("apply.employer.field.name.error") : undefined}
        >
          <Input
            autoComplete="name"
            maxLength={120}
            placeholder="e.g. Rahul Verma"
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
          <View accessibilityRole="summary" className="flex-row items-start gap-3 rounded-control border border-warning-line bg-warning-surface p-3.5">
            <FileText size={18} color="#f59e0b" className="mt-0.5 shrink-0" />
            <View className="flex-1 gap-1">
              <Text className="font-bold text-xs text-text">Authorization letter required</Text>
              <Text className="text-xs text-text-secondary leading-5">{t("apply.employer.contact.letterNote")}</Text>
            </View>
          </View>
        ) : null}
      </FormSection>

      <FormSection title="Verification and contact">
        <Field
          label={t("apply.employer.field.email.label")}
          error={problems.invalid.has("email") ? t("apply.employer.field.email.error") : undefined}
        >
          <Input
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            maxLength={254}
            placeholder="e.g. rahul@company.com"
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

        <View className="flex-row items-start gap-3 rounded-control bg-surface-sunken p-4">
          <ShieldCheck size={16} color="#16a34a" className="mt-0.5 shrink-0" />
          <View className="flex-1 gap-0.5">
            <Text className="font-semibold text-xs text-text">Your ID stays private</Text>
            <Text className="text-xs text-text-secondary leading-5">
              Your personal identity document is used exclusively by Operations to confirm your authority to hire for this business, and is never shown to applicants.
            </Text>
          </View>
        </View>
      </FormSection>
    </EmployerFrame>
  );
}
