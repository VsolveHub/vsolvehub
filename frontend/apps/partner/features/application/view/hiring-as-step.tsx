"use client";

import type { Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Dialog, ErrorState, buttonStyles, cn, useT } from "@vsolve/ui";
import { Building2, Check, House } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { hiringAsOf } from "../model/employer";
import { hasEnteredDetails } from "../model/employer-form";
import { nextStep, type HiringAs } from "../model/steps";
import { isVersionConflict, useUpdateEmployerDetails } from "../queries";
import { ApplyDock } from "./apply-shell";
import { StepFrame } from "./application-editor";
import { EmployerGuard } from "./employer-guard";

type Application = Schemas["PartnerApplication"];

const CHOICES: readonly { type: HiringAs; icon: ReactNode }[] = [
  { type: "INDIVIDUAL", icon: <House size={22} aria-hidden /> },
  { type: "BUSINESS", icon: <Building2 size={22} aria-hidden /> },
];

const titleKey = (type: HiringAs) =>
  type === "INDIVIDUAL"
    ? "apply.employer.hiringAs.individual.title"
    : "apply.employer.hiringAs.business.title";
const descriptionKey = (type: HiringAs) =>
  type === "INDIVIDUAL"
    ? "apply.employer.hiringAs.individual.description"
    : "apply.employer.hiringAs.business.description";

/**
 * "Who is hiring?": for myself or my home, or for my business. What the employer is asked next,
 * and what they upload, follows from this. There is no agency option.
 */
export function HiringAsStep() {
  return (
    <EmployerGuard screen="hiring-as">
      {(application) => <HiringAsChoice application={application} />}
    </EmployerGuard>
  );
}

function HiringAsChoice({ application }: { application: Application }) {
  const t = useT();
  const router = useRouter();
  const update = useUpdateEmployerDetails();
  const current = hiringAsOf(application.employer);
  const editable = application.can_edit;
  // A switch that would clear what they typed waits here until they confirm it.
  const [switchingTo, setSwitchingTo] = useState<HiringAs | null>(null);

  const goOn = (type: HiringAs) =>
    router.push(nextStep("/apply/hiring-as", "EMPLOYER", type)?.href ?? "/apply");

  function save(type: HiringAs) {
    update.mutate(
      { hiring_as: type },
      {
        onSuccess: () => {
          setSwitchingTo(null);
          goOn(type);
        },
      },
    );
  }

  function choose(type: HiringAs) {
    if (type === current) {
      goOn(type);
    } else if (current !== "" && hasEnteredDetails(application)) {
      setSwitchingTo(type);
    } else {
      save(type);
    }
  }

  return (
    <>
      <StepFrame title={t("apply.employer.hiringAs.title")}>
        {editable ? null : (
          <p
            role="status"
            className="rounded-card border border-info-line bg-info-surface p-4 text-sm text-info-text"
          >
            {t("apply.editor.readOnlyNotice")}
          </p>
        )}
        <div role="radiogroup" aria-label={t("apply.employer.hiringAs.title")} className="grid gap-3">
          {CHOICES.map(({ type, icon }) => (
            <ChoiceCard
              key={type}
              selected={current === type}
              disabled={!editable || update.isPending}
              icon={icon}
              title={t(titleKey(type))}
              description={t(descriptionKey(type))}
              onSelect={() => choose(type)}
            />
          ))}
        </div>
        <p className="text-sm text-text-secondary">{t("apply.employer.hiringAs.agencyNote")}</p>
      </StepFrame>

      <ApplyDock>
        {update.error && switchingTo === null ? (
          isVersionConflict(update.error) ? (
            <ErrorState
              inline
              severity="warning"
              title={t("apply.editor.conflict.title")}
              message={t("apply.editor.conflict.message")}
            />
          ) : (
            <ErrorState
              inline
              title={t("apply.editor.saveFailed.title")}
              message={friendlyErrorMessage(update.error)}
            />
          )
        ) : null}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/apply"
            className={buttonStyles({
              variant: "outline",
              size: "lg",
              className: "shrink-0 px-4 sm:px-5 font-bold text-sm sm:text-base",
            })}
          >
            {t("common.back")}
          </Link>
        </div>
      </ApplyDock>

      <Dialog
        open={switchingTo !== null}
        onOpenChange={(open) => {
          if (!open && !update.isPending) setSwitchingTo(null);
        }}
        title={t("apply.employer.hiringAs.switch.title", {
          type: switchingTo ? t(titleKey(switchingTo)) : "",
        })}
        description={t("apply.employer.hiringAs.switch.message", {
          from: current ? t(titleKey(current)) : "",
        })}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              loading={update.isPending}
              onClick={() => {
                if (switchingTo) save(switchingTo);
              }}
            >
              {t("apply.employer.hiringAs.switch.confirm")}
            </Button>
            <Button variant="ghost" disabled={update.isPending} onClick={() => setSwitchingTo(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        }
      >
        {update.error ? (
          <p role="alert" className="text-sm text-danger-text">
            {friendlyErrorMessage(update.error)}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-3.5 rounded-card border bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow] hover:border-action hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
        selected ? "border-action ring-2 ring-action/30" : "border-line",
      )}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center self-start rounded-control bg-action-surface text-action">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold text-navy-900">{title}</span>
        <span className="text-sm text-text-secondary">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-action bg-action text-surface" : "border-line-strong",
        )}
      >
        {selected ? <Check size={14} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
