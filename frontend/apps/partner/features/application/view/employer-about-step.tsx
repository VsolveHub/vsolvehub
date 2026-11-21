"use client";

import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, useT } from "@vsolve/ui";
import { useEffect, useState } from "react";

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
          name="display_name"
          autoComplete="name"
          maxLength={120}
          value={draft.displayName}
          onChange={(event) => change({ displayName: event.target.value })}
        />
      </Field>

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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field required label={t("apply.employer.field.area.label")}>
          <Input
            name="area"
            maxLength={120}
            value={draft.area}
            onChange={(event) => change({ area: event.target.value })}
          />
        </Field>
        <Field required label={t("apply.employer.field.city.label")}>
          <Input
            name="city"
            autoComplete="address-level2"
            maxLength={80}
            value={draft.city}
            onChange={(event) => change({ city: event.target.value })}
          />
        </Field>
      </div>

      <Field
        required
        label={t("apply.employer.field.pinCode.label")}
        error={problems.invalid.has("pinCode") ? t("apply.employer.field.pinCode.error") : undefined}
      >
        <Input
          name="pin_code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={draft.pinCode}
          onChange={(event) => change({ pinCode: event.target.value.replace(/\D/g, "") })}
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
