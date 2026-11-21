"use client";

import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, useT } from "@vsolve/ui";
import { useEffect, useState } from "react";

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
          name="display_name"
          autoComplete="name"
          maxLength={120}
          value={draft.displayName}
          onChange={(event) => change({ displayName: event.target.value })}
        />
      </Field>

      <Field required label={t("apply.employer.contact.role.label")}>
        <Select
          name="poster_role"
          placeholder={t("apply.employer.contact.role.placeholder")}
          value={draft.role}
          onChange={(event) => change({ role: event.target.value })}
        >
          {ROLES.map((code) => (
            <option key={code} value={code}>
              {t(`apply.employer.contact.role.${code}`)}
            </option>
          ))}
        </Select>
      </Field>
      {draft.role !== "" && draft.role !== "OWNER" ? (
        <p role="note" className="rounded-control bg-surface-sunken p-3 text-sm text-text">
          {t("apply.employer.contact.letterNote")}
        </p>
      ) : null}

      <Field
        label={t("apply.employer.field.email.label")}
        error={problems.invalid.has("email") ? t("apply.employer.field.email.error") : undefined}
      >
        <Input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={draft.email}
          onChange={(event) => change({ email: event.target.value })}
        />
      </Field>

      <Field required label={t("apply.employer.field.idType.label")}>
        <Select
          name="id_document_type"
          placeholder={t("apply.employer.field.idType.placeholder")}
          value={draft.idType}
          onChange={(event) => change({ idType: event.target.value })}
        >
          {ID_TYPES.map((code) => (
            <option key={code} value={code}>
              {t(`apply.employer.field.idType.${code}`)}
            </option>
          ))}
        </Select>
      </Field>
    </EmployerFrame>
  );
}
