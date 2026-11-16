// Ported from frontend/apps/partner/features/application/view/status-banner.tsx
// 100% accurate layout, typography, status badges, and 4-stop stepper.

import type { Schemas } from "@vsolve/api-client";
import { Text } from "@vsolve/mobile-ui";
import { Check } from "lucide-react-native";
import { View } from "react-native";

import { applicationStatusPresentation, trackerStage, type Tone } from "../model/status";

type Application = Schemas["PartnerApplication"];

const STOPS = [
  { label: "Fill in" },
  { label: "Sent" },
  { label: "In review" },
  { label: "Decision" },
] as const;

export interface ApplicationStatusTrackerProps {
  application: Application;
}

const BADGE_STYLES: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: "#f4f1ec", text: "#453f37" },
  info: { bg: "#e0f2fe", text: "#0369a1" },
  success: { bg: "#dcfce7", text: "#15803d" },
  warning: { bg: "#fef3c7", text: "#b45309" },
  danger: { bg: "#fee2e2", text: "#b91c1c" },
};

export function ApplicationStatusTracker({ application }: ApplicationStatusTrackerProps) {
  const presentation = applicationStatusPresentation(application.status);
  const stage = trackerStage(application.status);
  const isWaiting = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const badgeStyle = BADGE_STYLES[presentation.tone] ?? BADGE_STYLES.neutral;

  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#e7e2da",
        backgroundColor: "#ffffff",
        padding: 18,
        rowGap: 16,
      }}
    >
      {/* Top: Status Badge + Headline */}
      <View style={{ rowGap: 6, alignItems: "flex-start" }}>
        <View
          style={{
            backgroundColor: badgeStyle.bg,
            borderRadius: 9999,
            paddingHorizontal: 12,
            paddingVertical: 3.5,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: badgeStyle.text,
            }}
          >
            {presentation.label}
          </Text>
        </View>

        <Text
          style={{
            fontSize: 23,
            fontWeight: "800",
            color: "#00112e",
            letterSpacing: -0.4,
            lineHeight: 28,
          }}
        >
          {presentation.headline}
        </Text>
      </View>

      {/* 4-Stop Horizontal Stepper matching the web tracker */}
      <View
        accessibilityLabel="Application progress"
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingVertical: 2,
        }}
      >
        {STOPS.map((stop, index) => {
          const isDone = index < stage;
          const isCurrent = index === stage;

          return (
            <View
              key={stop.label}
              style={{
                alignItems: "center",
                flex: 1,
              }}
            >
              {/* Step Circle Indicator */}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDone
                    ? "#15803d"
                    : isCurrent
                      ? "#f87000"
                      : "transparent",
                  borderWidth: isDone || isCurrent ? 0 : 1.5,
                  borderColor: isDone || isCurrent ? "transparent" : "#cbd5e1",
                }}
              >
                {isDone ? (
                  <Check size={14} color="#ffffff" strokeWidth={3} />
                ) : (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: isCurrent ? "#ffffff" : "#64748b",
                    }}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              {/* Step Label */}
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: isCurrent ? "700" : "500",
                  color: isCurrent ? "#00112e" : "#64748b",
                  textAlign: "center",
                }}
              >
                {stop.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Reviewer Note for CHANGES_REQUIRED */}
      {application.status === "CHANGES_REQUIRED" ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#fde68a",
            backgroundColor: "#fffbeb",
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 13, color: "#92400e", lineHeight: 18 }}>
            {application.change_request_message ||
              "A reviewer asked for changes. Review your application details below."}
          </Text>
        </View>
      ) : null}

      {/* Subtitle / Next Instructions */}
      <Text
        style={{
          fontSize: 14,
          color: "#453f37",
          lineHeight: 20,
        }}
      >
        {presentation.next}
      </Text>

      {/* Submission Timestamp for Waiting States */}
      {isWaiting && application.submitted_at ? (
        <Text style={{ fontSize: 12, color: "#94a3b8" }}>
          Submitted on{" "}
          <Text style={{ fontWeight: "700", color: "#475569" }}>
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

// Backward-compatible export
export const ApplicationStatusBanner = ApplicationStatusTracker;
