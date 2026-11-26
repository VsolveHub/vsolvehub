"use client";

import type { Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Dialog, ErrorState, buttonStyles, cn, useT } from "@vsolve/ui";
import { Building2, Check, House, Info } from "lucide-react";
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
  // The card they clicked lights up at once, instead of waiting for the save to come back.
  const [picked, setPicked] = useState<HiringAs | null>(null);

  const goOn = (type: HiringAs) =>
    router.push(nextStep("/apply/hiring-as", "EMPLOYER", type)?.href ?? "/apply");

  function save(type: HiringAs) {
    setPicked(type);
    update.mutate(
      { hiring_as: type },
      {
        onSuccess: () => {
          setSwitchingTo(null);
          goOn(type);
        },
        onError: () => setPicked(null),
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
              type={type}
              selected={(picked ?? current) === type}
              disabled={!editable || update.isPending}
              icon={icon}
              title={t(titleKey(type))}
              description={t(descriptionKey(type))}
              onSelect={() => choose(type)}
            />
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-control bg-surface-sunken p-4 text-sm text-text-secondary">
          <Info size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
          <p className="leading-relaxed">{t("apply.employer.hiringAs.agencyNote")}</p>
        </div>
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
  type: HiringAs;
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
        "group flex items-center gap-4 rounded-card border p-4 text-left transition-colors duration-fast sm:p-5",
        "hover:border-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed",
        selected ? "border-action bg-selected-surface/50" : "border-line bg-surface disabled:opacity-60",
      )}
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-control transition-colors duration-fast",
          selected ? "bg-action text-surface" : "bg-action-surface text-action",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold text-text">{title}</span>
        <span className="text-sm leading-relaxed text-text-secondary">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
          selected ? "border-action bg-action text-surface" : "border-line-strong bg-surface",
        )}
      >
        {selected ? <Check size={12} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
