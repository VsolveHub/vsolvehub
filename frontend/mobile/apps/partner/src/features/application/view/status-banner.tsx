// Ported from frontend/apps/partner/features/application/view/status-banner.tsx
// 100% accurate layout, typography, status badges, and 4-stop stepper.

import type { Schemas } from "@vsolve/api-client";
import { Text } from "@vsolve/mobile-ui";
import { Check, Clock } from "lucide-react-native";
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

/** The coloured status pill ("● Sent"), shared by the status card and the profile page. */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const colors = BADGE_STYLES[tone] ?? BADGE_STYLES.neutral;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        columnGap: 6,
        backgroundColor: colors.bg,
        borderRadius: 9999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text }} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>{label}</Text>
    </View>
  );
}

const SUBMITTED_AT = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function ApplicationStatusTracker({ application }: ApplicationStatusTrackerProps) {
  const presentation = applicationStatusPresentation(application.status);
  const stage = trackerStage(application.status);
  const isWaiting = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";

  return (
    <View
      accessibilityRole="summary"
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#e7e2da",
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      <View style={{ padding: 18, rowGap: 18 }}>
        {/* Status pill + headline */}
        <View style={{ rowGap: 8, alignItems: "flex-start" }}>
          <StatusPill tone={presentation.tone} label={presentation.label} />
          <Text style={{ fontSize: 22, fontWeight: "800", color: "#00112e", letterSpacing: -0.4, lineHeight: 28 }}>
            {presentation.headline}
          </Text>
        </View>

        {/* 4-stop stepper, joined by a line that fills as the application moves on */}
        <View accessibilityLabel="Application progress" style={{ flexDirection: "row" }}>
          {STOPS.map((stop, index) => {
            const isDone = index < stage;
            const isCurrent = index === stage;
            return (
              <View key={stop.label} style={{ flex: 1, alignItems: "center" }}>
                <View style={{ width: "100%", height: 24, alignItems: "center", justifyContent: "center" }}>
                  {index > 0 ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        right: "50%",
                        height: 2,
                        backgroundColor: index <= stage ? "#15803d" : "#e7e2da",
                      }}
                    />
                  ) : null}
                  {index < STOPS.length - 1 ? (
                    <View
                      style={{
                        position: "absolute",
                        left: "50%",
                        right: 0,
                        height: 2,
                        backgroundColor: index < stage ? "#15803d" : "#e7e2da",
                      }}
                    />
                  ) : null}
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDone ? "#15803d" : isCurrent ? "#f87000" : "#ffffff",
                      borderWidth: isDone || isCurrent ? 0 : 1.5,
                      borderColor: "#d3ccc0",
                    }}
                  >
                    {isDone ? (
                      <Check size={13} color="#ffffff" strokeWidth={3} />
                    ) : (
                      <Text style={{ fontSize: 11, fontWeight: "700", color: isCurrent ? "#ffffff" : "#756c5e" }}>
                        {index + 1}
                      </Text>
                    )}
                  </View>
                </View>
                <Text
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: isCurrent ? "700" : "500",
                    color: isCurrent ? "#00112e" : "#756c5e",
                    textAlign: "center",
                  }}
                >
                  {stop.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Reviewer note for CHANGES_REQUIRED */}
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
      </View>

      {/* Footer strip: what happens next, and when it was sent */}
      <View
        style={{
          flexDirection: "row",
          columnGap: 10,
          borderTopWidth: 1,
          borderTopColor: "#efebe5",
          backgroundColor: "#faf8f5",
          paddingHorizontal: 18,
          paddingVertical: 14,
        }}
      >
        <Clock size={16} color="#756c5e" strokeWidth={2} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, rowGap: 4 }}>
          <Text style={{ fontSize: 14, color: "#453f37", lineHeight: 20 }}>{presentation.next}</Text>
          {isWaiting && application.submitted_at ? (
            <Text style={{ fontSize: 12, color: "#756c5e" }}>
              Submitted on{" "}
              <Text style={{ fontWeight: "700", color: "#453f37" }}>
                {SUBMITTED_AT.format(new Date(application.submitted_at))}
              </Text>
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// Backward-compatible export
export const ApplicationStatusBanner = ApplicationStatusTracker;
