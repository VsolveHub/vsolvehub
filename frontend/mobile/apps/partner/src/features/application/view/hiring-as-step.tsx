// Ported from frontend/apps/partner/features/application/view/hiring-as-step.tsx
import type { Schemas } from "@vsolve/api-client";
import { Button, Dialog, ErrorState, Text, cn, useT } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import { useRouter } from "expo-router";
import { Building2, Check, House } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { hiringAsOf } from "../model/employer";
import { hasEnteredDetails } from "../model/employer-form";
import { nextStep, type HiringAs } from "../model/steps";
import { isVersionConflict, useUpdateEmployerDetails } from "../queries";
import { StepFrame } from "./application-editor";
import { EmployerGuard } from "./employer-guard";

type Application = Schemas["PartnerApplication"];

const CHOICES: readonly { type: HiringAs; icon: ReactNode }[] = [
  { type: "INDIVIDUAL", icon: <House size={22} color="#00112e" /> },
  { type: "BUSINESS", icon: <Building2 size={22} color="#00112e" /> },
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
 * and what they upload, follows from this. There is no agency option. Tapping a choice moves on;
 * the Continue bar is not shown here, as on the website.
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
    router.push((nextStep("/apply/hiring-as", "EMPLOYER", type)?.href ?? "/apply") as never);

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
          <View accessibilityRole="alert" className="mb-4 rounded-card border border-info-line bg-info-surface p-4">
            <Text className="text-sm text-info-text">{t("apply.editor.readOnlyNotice")}</Text>
          </View>
        )}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("apply.employer.hiringAs.title")}
          style={{ rowGap: 12 }}
        >
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
        </View>
        <Text className="mt-4 text-sm text-text-secondary">{t("apply.employer.hiringAs.agencyNote")}</Text>
        {update.error && switchingTo === null ? (
          <View className="mt-4">
            {isVersionConflict(update.error) ? (
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
                message={describeError(update.error, "mutation").message}
              />
            )}
          </View>
        ) : null}
      </StepFrame>

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
          <>
            <Button variant="ghost" disabled={update.isPending} onClick={() => setSwitchingTo(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              loading={update.isPending}
              onClick={() => {
                if (switchingTo) save(switchingTo);
              }}
            >
              {t("apply.employer.hiringAs.switch.confirm")}
            </Button>
          </>
        }
      >
        {update.error ? (
          <Text accessibilityRole="alert" className="text-sm text-danger-text">
            {describeError(update.error, "mutation").message}
          </Text>
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
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      className={cn(
        "min-h-11 flex-row items-center gap-3.5 rounded-card border bg-surface p-4 active:bg-surface-sunken",
        selected ? "border-action" : "border-line",
        disabled && "opacity-60",
      )}
    >
      <View className="size-11 shrink-0 items-center justify-center self-start rounded-control bg-action-surface">
        {icon}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-bold text-navy-900">{title}</Text>
        <Text className="text-sm text-text-secondary">{description}</Text>
      </View>
      <View
        className={cn(
          "size-6 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-action bg-action" : "border-line-strong",
        )}
      >
        {selected ? <Check size={14} strokeWidth={3} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}
