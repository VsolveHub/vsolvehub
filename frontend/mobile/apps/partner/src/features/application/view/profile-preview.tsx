import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useCurrentSession } from "@vsolve/query/native";
import { useRouter } from "expo-router";
import { Check, CheckCircle2, MapPin, Pencil, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useWorkCatalog } from "@/features/catalog/queries";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { isEditable, requiredDocumentKinds } from "../model/readiness";
import { WEEKDAYS } from "../model/schedule";
import {
  applicationStatusPresentation,
  documentLabel,
  documentStatusPresentation,
  trackLabel,
} from "../model/status";
import { isListingTrack } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability } from "../queries";
import { useApplicationReference, type ApplicationReference } from "../reference-queries";
import { STATUS_ACCENT, StatusPill } from "./status-banner";

const SUBMITTED_AT = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

type Application = Schemas["PartnerApplication"];

interface SectionProps {
  application: Application;
  reference: ApplicationReference;
}

/**
 * Read-only preview of everything the applicant has entered, one section per step of their own
 * track (6 for services, 3 for stays and rentals). Opened from Profile in the profile menu.
 * The website's `/apply/profile` is the same page: keep the two in step.
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
  const session = useCurrentSession(getApiClient());
  const phone = session.data?.user?.phone_number;
  const availability = usePartnerAvailability();
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
  const status = applicationStatusPresentation(application.status);
  const name = application.display_name.trim();
  // The same progress the overview checklist shows, so a card never disagrees with it.
  const progress = stepProgress(application, availability.data).filter((step) => SECTIONS[step.href]);
  const summary = progressSummary(application, availability.data);

  return (
    <View style={styles.page}>
      {/* Who, which track, where the application is, and how much of it is done */}
      <View style={[styles.card, styles.headerCard]}>
        <View style={{ height: 4, backgroundColor: STATUS_ACCENT[status.tone] }} />
        <View style={styles.headerBody}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              {name ? (
                <Text style={styles.avatarText}>{name[0]?.toUpperCase()}</Text>
              ) : (
                <User size={22} color="#ffffff" strokeWidth={2.2} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {name || "Your profile"}
              </Text>
              <Text style={styles.muted}>{[phone, trackLabel(application.track)].filter(Boolean).join(" · ")}</Text>
            </View>
            <ProgressRing done={summary.done} total={summary.total} />
          </View>

          <View style={styles.statusLine}>
            <StatusPill tone={status.tone} label={status.label} />
            {application.submitted_at ? (
              <Text style={styles.small}>{`Submitted on ${SUBMITTED_AT.format(new Date(application.submitted_at))}`}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {progress.map((step, index) => {
        const Section = SECTIONS[step.href]!;
        return (
          <View key={step.href} style={styles.card}>
            <View style={styles.cardHeader}>
              <StepMark step={step} number={index + 1} />
              <Text style={styles.cardTitle}>{step.label}</Text>
              {editable ? (
                <Pressable
                  cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${step.label}`}
                  onPress={() => router.push(step.href as never)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.editButton, pressed ? styles.editButtonPressed : null]}
                >
                  <Pencil size={13} color="#c2410c" strokeWidth={2.2} />
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.cardBody}>
              <Section application={application} reference={reference} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const RING_SIZE = 56;
const RING_RADIUS = 23;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * How much of the application is filled in: a ring that closes as steps are done, the count
 * inside. The full sentence is what a screen reader hears. Same as the website's ring.
 */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const fraction = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${total} steps complete`}
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={styles.ring}
    >
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke="#efebe5" strokeWidth={4} fill="none" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={fraction >= 1 ? "#15803d" : "#f87000"}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
        />
      </Svg>
      <Text style={styles.ringText}>{`${done}/${total}`}</Text>
    </View>
  );
}

/**
 * The step's number circle doubles as its state: a tick when complete, "!" while something is
 * missing, the number when the step is optional. The words are what a screen reader hears.
 */
function StepMark({ step, number }: { step: StepProgress; number: number }) {
  const description =
    step.state === "done"
      ? "Done"
      : step.state === "optional"
        ? "Optional — you can set this later"
        : step.outstanding === 1
          ? "1 thing needed"
          : `${step.outstanding} things needed`;
  const look =
    step.state === "done" ? styles.markDone : step.state === "todo" ? styles.markTodo : styles.markOptional;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={description} style={[styles.mark, look]}>
      {step.state === "done" ? (
        <Check size={13} color="#ffffff" strokeWidth={3} />
      ) : (
        <Text style={[styles.markText, step.state === "todo" ? { color: "#b45309" } : null]}>
          {step.state === "todo" ? "!" : number}
        </Text>
      )}
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
  return (
    <>
      <Row label="Full Name" value={application.display_name || "Not set"} />
      <Row
        label={isListingTrack(application.track) ? "About you (optional)" : "About Your Work (Bio)"}
        value={application.biography || "Not set"}
      />
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
          <View style={styles.chips}>
            {jobTypes.map((jobType) => (
              <View key={jobType} style={styles.chip}>
                <Text style={styles.chipText}>{jobType}</Text>
              </View>
            ))}
          </View>
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
  if (application.service_area_ids.length === 0) return <NotSet />;
  return (
    <View style={styles.chips}>
      {application.service_area_ids.map((id) => (
        <View key={id} style={styles.chip}>
          <MapPin size={12} color="#453f37" strokeWidth={2} />
          <Text style={styles.chipText}>{areaName(reference, id)}</Text>
        </View>
      ))}
    </View>
  );
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
                <View key={rule.id} style={styles.spread}>
                  <Text style={styles.value}>{WEEKDAYS[rule.weekday] ?? ""}</Text>
                  <Text style={styles.value}>
                    {`${rule.starts_at.slice(0, 5)} – ${rule.ends_at.slice(0, 5)}${rule.ends_next_day ? " (next day)" : ""}`}
                  </Text>
                </View>
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
        const status = doc ? documentStatusPresentation(doc) : null;
        return (
          <View key={kind} style={styles.row}>
            <View style={styles.spread}>
              <Text style={[styles.value, styles.strong]}>{documentLabel(kind)}</Text>
              <StatusPill tone={status?.tone ?? "neutral"} label={status?.label ?? "Not uploaded"} />
            </View>
            {doc ? <Text style={styles.muted}>{doc.file_name}</Text> : null}
            {doc?.review_reason ? <Text style={styles.danger}>{doc.review_reason}</Text> : null}
          </View>
        );
      })}
    </>
  );
}

const ACCEPTED_ON = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function AgreementsSection({ application, reference }: SectionProps) {
  const accepted = application.consents.filter((consent) => consent.withdrawn_at === null);
  if (accepted.length === 0) return <Text style={styles.muted}>Not accepted yet</Text>;
  return (
    <>
      {accepted.map((consent) => (
        <View key={consent.id} style={styles.agreement}>
          <CheckCircle2 size={16} color="#15803d" strokeWidth={2.2} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.value}>
              {reference.requiredConsents.find((doc) => doc.purpose === consent.purpose)?.title ?? consent.purpose}
            </Text>
            <Text style={styles.muted}>{`Accepted on ${ACCEPTED_ON.format(new Date(consent.accepted_at))}`}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  page: { rowGap: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, rowGap: 12 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e7e2da",
    padding: 16,
    rowGap: 12,
  },
  headerCard: { padding: 0, rowGap: 0, overflow: "hidden" },
  headerBody: { padding: 16, rowGap: 16 },
  identity: { flexDirection: "row", alignItems: "center", columnGap: 12 },
  small: { fontSize: 12, color: "#756c5e" },
  statusLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 6,
    borderTopWidth: 1,
    borderTopColor: "#efebe5",
    paddingTop: 14,
  },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringText: { fontSize: 12, fontWeight: "800", color: "#00112e" },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: "#15803d" },
  markTodo: { backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fcd34d" },
  markOptional: { backgroundColor: "#f4f1ec" },
  markText: { fontSize: 12, fontWeight: "800", color: "#453f37" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#00112e",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "800", color: "#ffffff" },
  name: { fontSize: 18, fontWeight: "800", color: "#00112e", letterSpacing: -0.3 },
  cardHeader: { flexDirection: "row", alignItems: "center", columnGap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: "#00112e" },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
    borderRadius: 9999,
    backgroundColor: "#fff7ed",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editButtonPressed: { backgroundColor: "#ffedd5" },
  editLink: { fontSize: 13, fontWeight: "700", color: "#c2410c" },
  cardBody: { rowGap: 14, borderTopWidth: 1, borderTopColor: "#efebe5", paddingTop: 14 },
  row: { rowGap: 4 },
  spread: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 4 },
  label: { fontSize: 12, fontWeight: "600", color: "#756c5e" },
  value: { fontSize: 14, lineHeight: 20, color: "#00112e" },
  strong: { fontWeight: "700" },
  muted: { fontSize: 13, lineHeight: 19, color: "#756c5e" },
  danger: { fontSize: 13, lineHeight: 19, color: "#b91c1c" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
    borderRadius: 9999,
    backgroundColor: "#f4f1ec",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12.5, fontWeight: "600", color: "#453f37" },
  agreement: { flexDirection: "row", columnGap: 10 },
  startButton: { borderRadius: 12, backgroundColor: "#f87000", paddingHorizontal: 20, paddingVertical: 12 },
  startButtonText: { fontSize: 14, fontWeight: "700", color: "#00112e" },
});
