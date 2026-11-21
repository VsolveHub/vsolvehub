"use client";

import type { Schemas } from "@vsolve/api-client";
import { Field, Input, Select, useT } from "@vsolve/ui";
import { Building2, FileText, ShieldCheck } from "lucide-react";
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
        <div className="flex items-center gap-2.5 rounded-control bg-surface-sunken px-4 py-3 text-sm text-text-secondary">
          <Building2 size={16} className="text-action shrink-0" aria-hidden />
          <span>
            Hiring representative for <strong className="font-semibold text-text">{companyName}</strong>
          </span>
        </div>
      ) : null}

      <FormSection title="Your details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            required
            label={t("apply.employer.field.name.label")}
            error={problems.invalid.has("displayName") ? t("apply.employer.field.name.error") : undefined}
          >
            <Input
              name="display_name"
              autoComplete="name"
              maxLength={120}
              placeholder="e.g. Rahul Verma"
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
        </div>

        {draft.role !== "" && draft.role !== "OWNER" ? (
          <div role="note" className="flex items-start gap-3 rounded-control border border-warning-line/60 bg-warning-surface/50 p-3.5 text-xs sm:text-sm text-text">
            <FileText size={18} className="mt-0.5 shrink-0 text-warning-text" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-text">Authorization letter required</span>
              <p className="leading-relaxed text-text-secondary">{t("apply.employer.contact.letterNote")}</p>
            </div>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Verification and contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("apply.employer.field.email.label")}
            error={problems.invalid.has("email") ? t("apply.employer.field.email.error") : undefined}
          >
            <Input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="e.g. rahul@company.com"
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
        </div>

        <div className="flex items-start gap-3 rounded-control bg-surface-sunken p-4 text-xs text-text-secondary">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success-text" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-text">Your ID stays private</span>
            <p className="leading-relaxed">
              Your personal ID is reviewed confidentially by Operations to confirm your authority to hire for this business, and is never displayed to applicants.
            </p>
          </div>
        </div>
      </FormSection>
    </EmployerFrame>
  );
}
