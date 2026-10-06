// Ported from frontend/apps/partner/features/application/view/review-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { Button, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { canSubmit, isEditable, outstandingRequirements } from "../model/readiness";
import { isVersionConflict, usePartnerApplication, useSubmitApplication } from "../queries";
import { useApplicationReference } from "../reference-queries";
import { ApplicationStatusBanner } from "./status-banner";

export function ReviewStep() {
  const router = useRouter();
  const query = usePartnerApplication();
  const reference = useApplicationReference();
  const submit = useSubmitApplication();
  const [confirmed, setConfirmed] = useState(false);
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending || reference.isPending) {
    return (
      <View className="flex-row items-center gap-2 px-4 py-8">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your application summary…</Text>
      </View>
    );
  }
  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }
  const application = query.data ?? null;
  if (application === null) {
    return (
      <View className="gap-3 px-4 py-6">
        <Text className="text-xl font-bold text-text">Review and Submit</Text>
        <Text className="text-sm text-text-secondary">You have not started your application yet.</Text>
        <Button onPress={() => router.push("/apply/about")}>Start Your Application Now</Button>
      </View>
    );
  }

  const outstanding = outstandingRequirements(application);
  const ready = canSubmit(application);
  const skillName = new Map(reference.skills.map((skill) => [skill.code, skill.name]));
  const areaName = new Map(reference.serviceAreas.map((area) => [area.id, area.name]));
  const editable = isEditable(application);

  return (
    <ScrollView contentContainerClassName="gap-5 px-4 py-5 pb-20">
      <Text className="text-2xl font-extrabold text-text">Review & Submit</Text>
      <Text className="text-sm text-text-secondary">
        Please review your details below before sending for partner verification. You can edit any section.
      </Text>
      <ApplicationStatusBanner application={application} />
      {!ready ? (
        <View className="rounded-card border border-warning-line bg-warning-surface p-4">
          <Text className="text-sm font-bold text-warning-text">Items remaining before you can submit:</Text>
          {outstanding.map((item) => (
            <Text key={item.code} className="mt-1 text-sm text-text">
              {item.label}
            </Text>
          ))}
        </View>
      ) : null}
      <Section title="1. About you" onEdit={editable ? () => router.push("/apply/about") : undefined}>
        <Text className="text-sm font-bold text-text">{application.display_name || "Not set"}</Text>
        <Text className="text-sm text-text">
          {application.experience_years} {application.experience_years === 1 ? "Year" : "Years"}
        </Text>
        <Text className="text-xs text-text-secondary">{application.biography || "No biography entered yet."}</Text>
      </Section>
      <Section title="2. Trades & Services" onEdit={editable ? () => router.push("/apply/work") : undefined}>
        <Text className="text-sm text-text">
          {application.skill_codes.length === 0
            ? "No trade selected yet."
            : application.skill_codes.map((code) => skillName.get(code) ?? code).join(", ")}
        </Text>
        <Text className="text-xs text-text-secondary">{application.service_variant_ids.length} job service variants selected</Text>
      </Section>
      <Section title="3. Travel & Service Areas" onEdit={editable ? () => router.push("/apply/areas") : undefined}>
        <Text className="text-sm text-text">
          {application.service_area_ids.length === 0
            ? "No service area selected."
            : application.service_area_ids.map((id) => areaName.get(id) ?? id).join(", ")}
        </Text>
      </Section>
      {editable ? (
        <View className="gap-4 rounded-card border border-line bg-surface p-5">
          {isVersionConflict(submit.error) ? (
            <ErrorState
              inline
              title="Your application changed in another session"
              message="We have reloaded the latest data. Please check and submit again."
            />
          ) : submit.isError ? (
            <ErrorState
              inline
              title="We could not submit your application"
              message="Nothing was lost. Please verify all sections above and try again."
            />
          ) : null}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} onPress={() => setConfirmed((value) => !value)}>
            <Text className="text-xs leading-relaxed text-text-secondary">
              {confirmed ? "☑ " : "☐ "}
              I certify that all the information provided is accurate and truthful. I understand that my profile and documents will be reviewed by V Solve Hub Operations before activation.
            </Text>
          </Pressable>
          <View className="flex-row gap-3">
            <Button variant="outline" onPress={() => router.push("/apply/schedule")}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={!ready || !confirmed}
              loading={submit.isPending}
              loadingLabel="Submitting Application…"
              onPress={() => submit.mutate()}
            >
              Submit Application for Review
            </Button>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
  return (
    <View className="gap-2 rounded-card border border-line bg-surface p-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold uppercase text-text">{title}</Text>
        {onEdit ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${title}`} onPress={onEdit}>
            <Text className="text-sm font-semibold text-action">Edit</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
