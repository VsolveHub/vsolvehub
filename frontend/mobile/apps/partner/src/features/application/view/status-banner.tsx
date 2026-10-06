// Ported from frontend/apps/partner/features/application/view/status-banner.tsx
import type { Schemas } from "@vsolve/api-client";
import { cn, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

type Application = Schemas["PartnerApplication"];
type Status = Schemas["PartnerApplicationStatusEnum"];

interface Presentation {
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  label: string;
  headline: string;
  detail: string;
  isWaiting: boolean;
}

const PRESENTATION: Record<Status, Presentation> = {
  DRAFT: {
    tone: "neutral",
    label: "Draft",
    headline: "Your application is not submitted yet",
    detail: "Finish the steps below and send it for review. You can come back any time.",
    isWaiting: false,
  },
  SUBMITTED: {
    tone: "info",
    label: "Submitted",
    headline: "We have your application",
    detail: "Nothing more is needed from you right now. We will message you when a reviewer has looked at it.",
    isWaiting: true,
  },
  UNDER_REVIEW: {
    tone: "info",
    label: "Under review",
    headline: "A reviewer is checking your documents",
    detail: "Nothing more is needed from you right now. If anything is unclear, we will ask you directly.",
    isWaiting: true,
  },
  CHANGES_REQUIRED: {
    tone: "warning",
    label: "Changes needed",
    headline: "We need something corrected",
    detail: "",
    isWaiting: false,
  },
  APPROVED: {
    tone: "success",
    label: "Approved",
    headline: "You are approved to take work",
    detail: "Publish the hours you want to work and you will start receiving job offers.",
    isWaiting: false,
  },
  SUSPENDED: {
    tone: "danger",
    label: "Suspended",
    headline: "Your account is suspended",
    detail: "You will not receive job offers. Contact support to discuss this.",
    isWaiting: false,
  },
  OFFBOARDED: {
    tone: "neutral",
    label: "Closed",
    headline: "Your Partner account is closed",
    detail: "Contact support if you believe this is wrong.",
    isWaiting: false,
  },
};

export interface ApplicationStatusBannerProps {
  application: Application;
}

export function ApplicationStatusBanner({ application }: ApplicationStatusBannerProps) {
  if (application.status === "DRAFT") return null;

  const presentation = PRESENTATION[application.status];
  const detail =
    application.status === "CHANGES_REQUIRED"
      ? application.change_request_message ||
        "A reviewer asked for changes but did not leave a note. Contact support and we will tell you what is needed."
      : presentation.detail;

  return (
    <View
      accessibilityLiveRegion={presentation.isWaiting ? "polite" : "assertive"}
      className={cn(
        "rounded-2xl border p-5",
        presentation.tone === "info" && "border-sky-200 bg-sky-50",
        presentation.tone === "warning" && "border-amber-300 bg-amber-50",
        presentation.tone === "success" && "border-emerald-300 bg-emerald-50",
        presentation.tone === "danger" && "border-rose-300 bg-rose-50",
        presentation.tone === "neutral" && "border-line bg-surface-sunken",
      )}
    >
      <View className="flex-row flex-wrap items-center gap-2.5">
        <Text
          className={cn(
            "overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-white",
            presentation.tone === "info" && "bg-sky-600",
            presentation.tone === "warning" && "bg-amber-600",
            presentation.tone === "success" && "bg-emerald-600",
            presentation.tone === "danger" && "bg-rose-600",
            presentation.tone === "neutral" && "bg-navy-900",
          )}
        >
          {presentation.label}
        </Text>
        <Text className="text-base font-bold text-navy-900">{presentation.headline}</Text>
      </View>
      <Text className="mt-2 text-sm leading-relaxed text-text-secondary">{detail}</Text>
      {application.submitted_at && presentation.isWaiting ? (
        <Text className="mt-3 border-t border-line pt-2 text-xs font-medium text-text-muted">
          Submitted on{" "}
          <Text className="font-bold text-navy-900">
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(application.submitted_at))}
          </Text>
        </Text>
      ) : null}
    </View>
  );
}
