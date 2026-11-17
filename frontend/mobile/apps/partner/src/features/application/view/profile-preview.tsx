import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useCurrentSession } from "@vsolve/query/native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useWorkCatalog } from "@/features/catalog/queries";

import { isEditable, requiredDocumentKinds } from "../model/readiness";
import { WEEKDAYS } from "../model/schedule";
import { documentLabel, documentStatusPresentation } from "../model/status";
import { applicationSteps } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { useApplicationReference, type ApplicationReference } from "../reference-queries";

type Application = Schemas["PartnerApplication"];

interface SectionProps {
  application: Application;
  reference: ApplicationReference;
}

/**
 * Read-only preview of everything the applicant has entered, one section per step of their own
 * track (6 for services, 3 for stays and rentals). Opened from Profile in the profile menu.
 * Phone-only: the website has no such page (owner decision 2026-11-18).
 *
 * Every value comes from queries the steps already use, so they are usually cached.
 * A new step only needs an entry in `SECTIONS`.
 */
const SECTIONS: Record<string, (props: SectionProps) => ReactNode> = {
  "/apply/about": AboutSection,
  "/apply/work": WorkSection,
  "/apply/areas": AreasSection,
  "/apply/schedule": HoursSection,
  "/apply/documents": DocumentsSection,
  "/apply/review": AgreementsSection,
};

export function ProfilePreview() {
  const router = useRouter();
  const query = usePartnerApplication();
  const reference = useApplicationReference();
  const missing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending || reference.isPending) {
    return (
      <View style={styles.center}>
        <Spinner size="sm" />
        <Text style={styles.muted}>Loading your profile…</Text>
      </View>
    );
  }

  if ((query.isError && !missing) || reference.isError) {
    return (
      <ErrorState
        title="We could not load your profile"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => {
          void query.refetch();
          reference.refetch();
        }}
      />
    );
  }

  const application = missing ? null : query.data;
  if (!application) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>You have not started your application yet.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push("/apply")} style={styles.startButton}>
          <Text style={styles.startButtonText}>Start your application</Text>
        </Pressable>
      </View>
    );
  }

  const editable = isEditable(application);

  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>Your profile</Text>
      {applicationSteps(application.track).map((step, index) => {
        const Section = SECTIONS[step.href];
        if (!Section) return null;
        return (
          <View key={step.href} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{`${index + 1}. ${step.label}`}</Text>
              {editable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${step.label}`}
                  onPress={() => router.push(step.href as never)}
                  hitSlop={8}
                >
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            <Section application={application} reference={reference} />
          </View>
        );
      })}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function NotSet() {
  return <Text style={styles.muted}>Not set</Text>;
}

function AboutSection({ application }: SectionProps) {
  const session = useCurrentSession(getApiClient());
  const phone = session.data?.user?.phone_number;
  return (
    <>
      <Row label="Name" value={application.display_name || "Not set"} />
      {phone ? <Row label="Mobile number" value={phone} /> : null}
      <Row label="About you" value={application.biography || "Not set"} />
    </>
  );
}

function WorkSection({ application, reference }: SectionProps) {
  const catalog = useWorkCatalog();
  const trades = application.skill_codes.map(
    (code) => reference.skills.find((skill) => skill.code === code)?.name ?? code,
  );
  const services = catalog.data?.services ?? [];
  const jobTypes = application.service_variant_ids
    .map((id) => services.find((service) => service.variantId === id))
    .filter((service) => service !== undefined)
    .map((service) => `${service.serviceName} · ${service.variantName}`);

  return (
    <>
      <Row label="Trades" value={trades.length > 0 ? trades.join(", ") : "Not set"} />
      <View style={styles.row}>
        <Text style={styles.label}>Job types</Text>
        {catalog.isPending ? (
          <Spinner size="sm" />
        ) : catalog.isError ? (
          <Text style={styles.muted}>{`${application.service_variant_ids.length} selected`}</Text>
        ) : jobTypes.length > 0 ? (
          jobTypes.map((name) => (
            <Text key={name} style={styles.value}>
              {`• ${name}`}
            </Text>
          ))
        ) : (
          <NotSet />
        )}
      </View>
    </>
  );
}

function areaName(reference: ApplicationReference, id: string): string {
  return reference.serviceAreas.find((area) => area.id === id)?.name ?? "Area";
}

function AreasSection({ application, reference }: SectionProps) {
  const names = application.service_area_ids.map((id) => areaName(reference, id));
  return <Row label="Areas" value={names.length > 0 ? names.join(", ") : "Not set"} />;
}

function HoursSection({ application, reference }: SectionProps) {
  const availability = usePartnerAvailability();
  if (availability.isPending) return <Spinner size="sm" />;
  if (availability.isError) {
    return <Text style={styles.muted}>We could not load your hours. Open the step to see them.</Text>;
  }

  const rules = availability.data.rules.filter((rule) => rule.is_active);
  if (application.service_area_ids.length === 0 || rules.length === 0) return <NotSet />;

  return (
    <>
      {application.service_area_ids.map((areaId) => {
        const areaRules = rules
          .filter((rule) => rule.service_area_id === areaId)
          .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at));
        return (
          <View key={areaId} style={styles.row}>
            <Text style={styles.label}>{areaName(reference, areaId)}</Text>
            {areaRules.length === 0 ? (
              <NotSet />
            ) : (
              areaRules.map((rule) => (
                <Text key={rule.id} style={styles.value}>
                  {`${WEEKDAYS[rule.weekday] ?? ""}: ${rule.starts_at.slice(0, 5)} – ${rule.ends_at.slice(0, 5)}${
                    rule.ends_next_day ? " (next day)" : ""
                  }`}
                </Text>
              ))
            )}
          </View>
        );
      })}
    </>
  );
}

function DocumentsSection({ application }: SectionProps) {
  return (
    <>
      {requiredDocumentKinds(application).map((kind) => {
        const versions = application.documents.filter((doc) => doc.kind === kind && doc.status !== "SUPERSEDED");
        const doc = versions[versions.length - 1];
        const status = doc ? documentStatusPresentation(doc).label : "Not uploaded";
        return (
          <View key={kind} style={styles.row}>
            <Text style={styles.label}>{documentLabel(kind)}</Text>
            <Text style={styles.value}>{doc ? `${doc.file_name} · ${status}` : status}</Text>
            {doc?.review_reason ? <Text style={styles.muted}>{doc.review_reason}</Text> : null}
          </View>
        );
      })}
    </>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function AgreementsSection({ application, reference }: SectionProps) {
  const accepted = application.consents.filter((consent) => consent.withdrawn_at === null);
  if (accepted.length === 0) return <Text style={styles.muted}>Not accepted yet</Text>;
  return (
    <>
      {accepted.map((consent) => (
        <Row
          key={consent.id}
          label={reference.requiredConsents.find((doc) => doc.purpose === consent.purpose)?.title ?? consent.purpose}
          value={`Accepted on ${dateFormat.format(new Date(consent.accepted_at))}`}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  page: { rowGap: 14 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#00112e", marginBottom: 2 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, rowGap: 12 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e7e2da",
    padding: 18,
    rowGap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#00112e" },
  editLink: { fontSize: 14, fontWeight: "700", color: "#c2410c" },
  row: { rowGap: 3 },
  label: { fontSize: 12, fontWeight: "600", color: "#756c5e" },
  value: { fontSize: 14, lineHeight: 20, color: "#00112e" },
  muted: { fontSize: 13, lineHeight: 19, color: "#756c5e" },
  startButton: { borderRadius: 12, backgroundColor: "#f87000", paddingHorizontal: 20, paddingVertical: 12 },
  startButtonText: { fontSize: 14, fontWeight: "700", color: "#00112e" },
});
