// Ported from frontend/apps/partner/features/work-stack/view/visit-job-view.tsx
import { serverClock } from "@vsolve/api-client";
import { describeError } from "@vsolve/query/native";
import { ErrorState, Input, Text, Textarea, cn, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { STATUS_COPY, type StatusTone } from "@/features/work/model/status";
import {
  canAbort,
  canArrive,
  canGoEnRoute,
  canRelease,
  canReportCompletion,
  canStartWork,
  useAbortWork,
  useMarkArrived,
  useMarkCustomerUnavailable,
  useMarkEnRoute,
  useReleaseBooking,
  useRefreshVisitAtGates,
  useSubmitCompletion,
  useVerifyStartOtp,
  visitContact,
  waitingGate,
  type OutcomeInput,
  type PartnerVisit,
  type VisitStatus,
  type WaitingGate,
} from "@/features/work/queries";
import { useUploadCompletionPhoto, type PickedPhoto } from "@/features/work/completion-photo";
import { isInAppMapAvailable, isRoutable, usePartnerPosition, useVisitRoute } from "@/features/work/route";

import { CompletionRating } from "./completion-rating";
import { Pictogram, type PictogramName } from "./pictogram";
import { VisitRouteMap } from "./visit-route-map";

export function VisitJobView({ visit }: { readonly visit: PartnerVisit }) {
  const router = useRouter();
  const enRoute = useMarkEnRoute();
  const arrived = useMarkArrived();
  const unavailable = useMarkCustomerUnavailable();
  useRefreshVisitAtGates(visit);
  const gate = waitingGate(visit, serverClock.now());
  const status = STATUS_COPY[visit.status];
  const versioned = { bookingId: visit.id, expectedVersion: visit.version };
  const busy = enRoute.isPending || arrived.isPending || unavailable.isPending;
  const commandError = enRoute.error ?? arrived.error ?? unavailable.error;
  const money = visit.earning ?? visit.estimated_earning;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-5">
      <View className="bg-navy-900 px-4 pb-6 pt-4">
        <View className="flex-row items-center justify-between gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface/13">
            <Pictogram name="back" size="md" className="text-surface" />
          </Pressable>
          <Text className="rounded-full border border-surface/25 bg-surface/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.05em] text-surface">
            {status.label}
          </Text>
        </View>
        <Text className="mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-navy-200">Service visit</Text>
        <JobTitle visit={visit} />
        <View className="mt-5 flex-row flex-wrap gap-2">
          <View className={money ? "w-[48%]" : "w-full"}>
            <HeroFact icon="time" label="Starts" value={clockTime(visit.scheduled_start) ?? "Time pending"} />
          </View>
          {money ? (
            <View className="w-[48%]">
              <HeroFact icon="money" label={visit.earning ? "Final earning" : "Estimated earning"} value={formatMoney(money.net_paise)} />
            </View>
          ) : null}
        </View>
      </View>
      {commandError ? (
        <View className="px-4 pt-4">
          <CommandFailure error={commandError} />
        </View>
      ) : null}
      <View className="flex-col gap-4 px-4 pb-5 pt-4">
        {/* Where to go comes first: on the way, the map and the Navigate button are the screen. */}
        <VisitLocation visit={visit} />
        <View accessibilityLabel="Next step" className="rounded-card border border-line bg-surface p-4">
          <View className="mb-4 flex-row items-start gap-3">
            <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-selected-surface">
              <Pictogram name={STATUS_PICTOGRAM[visit.status]} size="md" className="text-action-secondary" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-base font-extrabold text-text">Next step</Text>
              <Text className="mt-0.5 text-sm leading-5 text-text-secondary">{STATUS_GUIDANCE[visit.status]}</Text>
            </View>
          </View>
          <View className="flex-col gap-3">
            {gate !== null ? <GateNotice gate={gate} /> : null}
            {canGoEnRoute(visit) ? (
              <BigAction tone="secondary" icon="go" label="I am on my way" disabled={busy} onPress={() => enRoute.mutate(versioned)} />
            ) : null}
            {canArrive(visit) ? (
              <BigAction tone="success" icon="yes" label="I have arrived" disabled={busy} onPress={() => arrived.mutate(versioned)} />
            ) : null}
            {canStartWork(visit) ? <StartCodePad visit={visit} /> : null}
            {visit.status === "ARRIVED" && visit.customer_unavailable_wait_started_at === null ? (
              <SecondaryAction icon="later" label="Nobody is here" consequence="Starts a paid wait. You keep the job." disabled={busy} onPress={() => unavailable.mutate(versioned)} />
            ) : null}
            {canAbort(visit) || canRelease(visit) ? (
              <View className="mt-2 border-t border-line pt-4">
                <ReleaseAction visit={visit} />
              </View>
            ) : null}
            {canReport(visit) ? <JobReport visit={visit} /> : null}
            {isWaiting(visit) ? <StatusMedallion status={visit.status} /> : null}
          </View>
        </View>
        <ServiceDetails visit={visit} />
        <VisitDetails visit={visit} />
      </View>
      <View className="bg-canvas px-4 pb-5">
        <CompletionRating
          subject="booking"
          id={visit.id}
          isComplete={visit.status === "COMPLETED" || visit.status === "PARTIALLY_COMPLETED"}
        />
      </View>
    </ScrollView>
  );
}

function JobTitle({ visit }: { readonly visit: PartnerVisit }) {
  const durableTitle = visit.display_title?.trim() || null;
  const [first, ...rest] = visit.work_tasks;
  return (
    <Text className="mt-1 max-w-[28ch] text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-surface">
      {durableTitle ?? (first === undefined ? "Your job" : first.label)}
      {durableTitle === null && rest.length > 0 ? ` +${rest.length} more` : ""}
    </Text>
  );
}

const LIVE_STATUSES: readonly VisitStatus[] = ["CONFIRMED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

/**
 * The Google Maps hand-off: turn-by-turn voice directions to the Customer's pin, on a two-wheeler.
 * Opens the Maps app when it is installed, and the Maps site when it is not.
 */
function navigationHref(visit: PartnerVisit): string | null {
  const address = visit.site_address;
  if (address === null) return null;
  const route = visit.directions_url || address.directions_url;
  if (route) return `${route}&travelmode=two-wheeler&dir_action=navigate`;
  const text = [address.line1, address.line2, address.landmark, address.locality, address.city, address.postal_code]
    .filter((part) => part.trim() !== "")
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}&travelmode=two-wheeler`;
}

/**
 * Where the job is and who to ask for, on the server's clock.
 *
 * Before the unlock (two hours before the start; at once for a job happening now) the locality is
 * all there is, and the card says when the rest arrives. After it: the route map, the address,
 * Navigate and Call — what the website showed and this screen never did.
 */
function VisitLocation({ visit }: { readonly visit: PartnerVisit }) {
  const live = LIVE_STATUSES.includes(visit.status);
  const mapOn = live && isInAppMapAvailable() && isRoutable(visit) && visit.status !== "ARRIVED";
  const origin = usePartnerPosition(mapOn);
  const route = useVisitRoute(visit, mapOn ? origin : null);
  if (!live) return null;

  const address = visit.site_address;
  if (address === null) {
    const unlocksAt = clockTime(visit.gates.address_unlocks_at);
    return (
      <View className="flex-row items-start gap-3 rounded-card border border-line bg-surface p-4">
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken">
          <Pictogram name="distance" size="md" className="text-text-muted" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-text">
            {visit.approximate_area ? `Near ${visit.approximate_area}` : "Customer address"}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-text-secondary">
            {unlocksAt === null
              ? "The exact address, the map and the customer's number appear closer to the visit."
              : `The exact address, the map and the customer's number appear at ${unlocksAt} on ${calendarDate(visit.gates.address_unlocks_at)}.`}
          </Text>
        </View>
      </View>
    );
  }

  const contact = visitContact(visit);
  const navigate = navigationHref(visit);
  const locality = [address.locality, address.city, address.postal_code].filter((part) => part.trim() !== "").join(", ");

  return (
    <View className="flex-col gap-3">
      {mapOn && route.data ? <VisitRouteMap route={route.data} /> : null}
      <View className="rounded-card border border-success-line bg-surface p-4">
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success-surface">
            <Pictogram name="site" size="md" className="text-success-text" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">Customer address</Text>
            <Text className="mt-0.5 text-base font-extrabold leading-snug text-text">{address.line1}</Text>
            {address.line2.trim() !== "" ? <Text className="text-sm leading-5 text-text">{address.line2}</Text> : null}
            {address.landmark.trim() !== "" ? (
              <Text className="text-sm leading-5 text-text-secondary">Near {address.landmark}</Text>
            ) : null}
            {locality !== "" ? <Text className="text-sm leading-5 text-text-secondary">{locality}</Text> : null}
          </View>
        </View>
        <View className="mt-4 flex-row gap-2">
          {navigate !== null ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Navigate with Google Maps"
              onPress={() => void Linking.openURL(navigate)}
              className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] bg-action-secondary"
            >
              <Pictogram name="go" size="md" className="text-surface" />
              <Text className="text-base font-bold text-surface">Navigate</Text>
            </Pressable>
          ) : null}
          {contact !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${contact.firstName}`}
              onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
              className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] border border-line-strong bg-surface"
            >
              <Pictogram name="call" size="md" className="text-action-secondary" />
              <Text numberOfLines={1} className="text-base font-bold text-text">Call {contact.firstName}</Text>
            </Pressable>
          ) : null}
        </View>
        {mapOn && route.isError ? (
          <Text className="mt-2 text-xs text-text-muted">The map could not load the route. Navigate still works.</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Why the next step is not on screen yet, and when it will be — instead of an error after a tap. */
function GateNotice({ gate }: { readonly gate: WaitingGate }) {
  const step = gate.action === "MARK_EN_ROUTE" ? "\u201cI am on my way\u201d" : "\u201cI have arrived\u201d";
  const opensAt = clockTime(gate.opensAt);
  const closesAt = clockTime(gate.closesAt);
  const copy =
    gate.state === "closed"
      ? `${step} closed${closesAt === null ? "" : ` at ${closesAt}`}. Open Booking support below.`
      : gate.state === "opening"
        ? `${step} is opening now\u2026`
        : `${step} opens at ${opensAt ?? "the visit time"} on ${calendarDate(gate.opensAt)}. Come back then \u2014 we will also remind you.`;
  return (
    <Text
      accessibilityRole="text"
      className={cn(
        "rounded-card border px-3.5 py-3 text-sm font-semibold leading-5",
        gate.state === "closed" ? "border-danger-line bg-danger-surface text-danger-text" : "border-line bg-surface-sunken text-text-secondary",
      )}
    >
      {copy}
    </Text>
  );
}

function HeroFact({ icon, label, value }: { readonly icon: PictogramName; readonly label: string; readonly value: string }) {
  return (
    <View className="min-w-0 flex-row items-center gap-2.5 rounded-card border border-surface/15 bg-surface/10 px-3 py-2.5">
      <Pictogram name={icon} size="md" className="shrink-0 text-action" />
      <View className="min-w-0 flex-1">
        <Text className="text-[0.625rem] font-bold uppercase tracking-[0.06em] text-navy-200">{label}</Text>
        <Text numberOfLines={1} className="text-base font-extrabold text-surface">{value}</Text>
      </View>
    </View>
  );
}

function ServiceDetails({ visit }: { readonly visit: PartnerVisit }) {
  return (
    <View className="rounded-card border border-line bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-selected-surface">
          <Pictogram name="all-work" size="md" className="text-action-secondary" />
        </View>
        <View>
          <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">Booked scope</Text>
          <Text className="text-base font-extrabold text-text">Service details</Text>
        </View>
      </View>
      <View className="mt-4 overflow-hidden rounded-card border border-line bg-surface-sunken">
        {visit.service_lines.length > 0 ? (
          visit.service_lines.map((line) => (
            <View key={line.line_id} className="flex-row items-center gap-3 border-b border-line px-3.5 py-3">
              <Pictogram name="yes" size="sm" className="shrink-0 text-success-text" />
              <Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text">{line.service_label}</Text>
              {line.quantity > 1 ? (
                <Text className="shrink-0 rounded-full border border-line bg-surface px-2 py-1 text-xs font-bold text-text-secondary">Qty {line.quantity}</Text>
              ) : null}
            </View>
          ))
        ) : (
          <View className="flex-row items-center gap-3 px-3.5 py-3">
            <Pictogram name="yes" size="sm" className="shrink-0 text-success-text" />
            <Text className="text-sm font-semibold leading-5 text-text">{visit.display_title?.trim() || "Your booked service"}</Text>
          </View>
        )}
      </View>
      {visit.requirements.length > 0 ? (
        <View className="mt-4 border-t border-line pt-4">
          <View className="flex-row items-center gap-2">
            <Pictogram name="doing" size="sm" className="text-action-secondary" />
            <Text className="text-sm font-bold text-text">Bring with you</Text>
          </View>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {visit.requirements.map((requirement) => (
              <Text key={requirement} className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-xs font-semibold capitalize text-text-secondary">
                {requirement}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function VisitDetails({ visit }: { readonly visit: PartnerVisit }) {
  return (
    <View>
      <Text className="mb-2 text-sm font-extrabold text-text">Visit details</Text>
      <View className="flex-row flex-wrap gap-2">
        <View className="w-[48%]"><DetailFact icon="date" label="Date" value={calendarDate(visit.scheduled_start)} /></View>
        <View className="w-[48%]"><DetailFact icon="time" label="Start time" value={clockTime(visit.scheduled_start) ?? "Time pending"} /></View>
        <View className="w-[48%]"><DetailFact icon="days" label="Expected work" value={durationLabel(visit.estimated_duration_minutes)} /></View>
        {visit.approximate_area ? (
          <View className="w-[48%]"><DetailFact icon="distance" label="Service area" value={visit.approximate_area} /></View>
        ) : null}
      </View>
    </View>
  );
}

function DetailFact({ icon, label, value }: { readonly icon: PictogramName; readonly label: string; readonly value: string }) {
  return (
    <View className="min-w-0 rounded-card border border-line bg-surface px-3 py-3">
      <View className="flex-row items-center gap-1.5">
        <Pictogram name={icon} size="sm" className="shrink-0 text-text-muted" />
        <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-text-muted">{label}</Text>
      </View>
      <Text className="mt-1 text-sm font-bold leading-5 text-text">{value}</Text>
    </View>
  );
}

const STATUS_GUIDANCE: Record<VisitStatus, string> = {
  CONFIRMED: "Review the scope and tools, then start travelling when you are ready.",
  EN_ROUTE: "Mark arrival only after you have reached the customer’s site.",
  ARRIVED: "Ask the customer for the start code before beginning the work.",
  IN_PROGRESS: "When you finish, tap All work done. Add a photo if you can.",
  ABORTED: "Report what was completed so the job can be settled correctly.",
  COMPLETION_SUBMITTED: "Your report is with the customer to confirm. If they do nothing, it confirms itself after 24 hours.",
  COMPLETED: "This job is complete and its final earning is shown above.",
  PARTIALLY_COMPLETED: "The completed portion has been recorded and settled.",
  DISPUTED: "The customer raised a problem. Vsolve will guide the next action.",
  RECOVERY_REQUIRED: "Vsolve support needs to resolve this job before it can continue.",
  CANCELLED: "This visit was cancelled. No travel or work is needed.",
};

const WAITING_STATUS: Record<VisitStatus, boolean> = {
  CONFIRMED: false,
  EN_ROUTE: false,
  ARRIVED: false,
  IN_PROGRESS: false,
  ABORTED: false,
  COMPLETION_SUBMITTED: true,
  COMPLETED: true,
  PARTIALLY_COMPLETED: true,
  DISPUTED: true,
  RECOVERY_REQUIRED: true,
  CANCELLED: true,
};

function canReport(visit: PartnerVisit): boolean {
  return canReportCompletion(visit) && visit.work_tasks.length > 0;
}

function isWaiting(visit: PartnerVisit): boolean {
  if (canReportCompletion(visit)) return !canReport(visit);
  return WAITING_STATUS[visit.status];
}

function StartCodePad({ visit }: { readonly visit: PartnerVisit }) {
  const verify = useVerifyStartOtp();
  const [code, setCode] = useState("");
  return (
    <View className="flex-col gap-3">
      {verify.error ? <CommandFailure error={verify.error} /> : null}
      <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">Start code</Text>
      <Input
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        className="h-16 text-center text-[2.125rem] font-extrabold tracking-[0.28em] text-text"
      />
      <Text className="text-[0.8125rem] leading-snug text-text-secondary">Ask the customer to read out their code.</Text>
      <BigAction
        tone="success"
        icon="power"
        label="Start work"
        disabled={code.length === 0 || verify.isPending}
        onPress={() => verify.mutate({ bookingId: visit.id, expectedVersion: visit.version, code })}
      />
    </View>
  );
}

type TaskChoice = "DONE" | "PARTIAL" | "NOT_DONE";

/**
 * Tap reasons, so nobody has to type on a phone at the end of a job. Each one names the outcome
 * it is: a "not done" reason decides whether the line was not needed, blocked or never started,
 * which is what decides the money.
 */
const PARTIAL_REASONS = ["Needs a spare part", "Ran out of time", "Customer asked to stop", "Other reason"] as const;
const NOT_DONE_REASONS: readonly { readonly label: string; readonly outcome: OutcomeInput["outcome"] }[] = [
  { label: "Customer did not want it", outcome: "NOT_APPLICABLE" },
  { label: "Needs a spare part", outcome: "BLOCKED" },
  { label: "Not safe to do", outcome: "BLOCKED" },
  { label: "Could not start", outcome: "NOT_STARTED" },
];

const TASK_CHOICES: readonly { readonly value: TaskChoice; readonly icon: PictogramName; readonly caption: string }[] = [
  { value: "DONE", icon: "done", caption: "Done" },
  { value: "PARTIAL", icon: "doing", caption: "Part done" },
  { value: "NOT_DONE", icon: "no", caption: "Not done" },
];

/**
 * The job report: one tap when the job went to plan, a few taps when it did not.
 *
 * Owner decision, 5 November 2026. It used to be a card of five choices per task and a text box
 * for every exception. Now "All work done" sends the whole report, with an optional photo of the
 * finished work; "Some work was not done" opens the per-task choices, each with tap reasons. A
 * stopped job (`ABORTED`) opens straight on the per-task choices, because "all done" is not true.
 */
function JobReport({ visit }: { readonly visit: PartnerVisit }) {
  const submit = useSubmitCompletion();
  const upload = useUploadCompletionPhoto(visit.id);
  const stopped = visit.status === "ABORTED";
  const [itemised, setItemised] = useState(stopped);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoSent, setPhotoSent] = useState(false);
  const [cameraRefused, setCameraRefused] = useState(false);
  const [choices, setChoices] = useState<Record<string, TaskChoice>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [damage, setDamage] = useState(false);
  const busy = submit.isPending || upload.isPending;

  const answered = visit.work_tasks.filter((task) => {
    const choice = choices[task.id];
    return choice === "DONE" || (choice !== undefined && reasons[task.id] !== undefined);
  }).length;
  const itemisedReady = answered === visit.work_tasks.length;

  async function takePhoto() {
    setCameraRefused(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraRefused(true);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
    setPhotoSent(false);
    upload.reset();
  }

  function outcomesFor(all: boolean): OutcomeInput[] {
    return visit.work_tasks.map((task) => {
      const choice = all ? "DONE" : choices[task.id];
      const reason = all ? "" : (reasons[task.id] ?? "");
      const outcome: OutcomeInput["outcome"] =
        choice === "DONE"
          ? "COMPLETED"
          : choice === "PARTIAL"
            ? "PARTIAL"
            : (NOT_DONE_REASONS.find((option) => option.label === reason)?.outcome ?? "NOT_STARTED");
      return { work_task_id: task.id, outcome, quantity: task.quantity, reason };
    });
  }

  async function send(all: boolean) {
    // The photo is optional: one that will not upload is reported, and the Partner can send
    // the report without it rather than being stuck on a job they finished.
    if (photo !== null && !photoSent && !upload.isError) {
      try {
        await upload.mutateAsync(photo);
        setPhotoSent(true);
      } catch {
        return;
      }
    }
    submit.mutate({
      bookingId: visit.id,
      expectedVersion: visit.version,
      notes: "",
      safetyDamageDeclared: damage,
      outcomes: outcomesFor(all),
    });
  }

  return (
    <View className="flex-col gap-3">
      {submit.error ? <CommandFailure error={submit.error} /> : null}

      {photo === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a photo of the finished work, optional"
          disabled={busy}
          onPress={() => void takePhoto()}
          className="min-h-16 flex-row items-center gap-3 rounded-[18px] border border-dashed border-line-strong bg-surface-sunken px-4 py-3"
        >
          <Pictogram name="photo" size="lg" className="text-action-secondary" />
          <View className="min-w-0 flex-1">
            <Text className="text-base font-bold text-text">Add a photo of the finished work</Text>
            <Text className="text-xs text-text-muted">Optional. It helps if the customer has a question later.</Text>
          </View>
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-3 rounded-[18px] border border-line bg-surface p-2.5">
          <Image source={{ uri: photo.uri }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-text">{photoSent ? "Photo added" : "Photo ready"}</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void takePhoto()}>
              <Text className="text-sm font-semibold text-action-secondary">Take it again</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove the photo"
            disabled={busy}
            onPress={() => {
              setPhoto(null);
              upload.reset();
            }}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken"
          >
            <Pictogram name="no" size="sm" className="text-text-muted" />
          </Pressable>
        </View>
      )}
      {cameraRefused ? (
        <Text className="text-xs text-text-muted">The camera is off for this app. You can send the report without a photo.</Text>
      ) : null}
      {upload.isError ? (
        <Text className="text-sm font-semibold text-danger-text">
          The photo did not upload. Tap send again to send the report without it, or take it again.
        </Text>
      ) : null}

      {!itemised ? (
        <>
          <BigAction
            tone="success"
            icon="yes"
            label={busy ? "Sending…" : "All work done"}
            disabled={busy || visit.work_tasks.length === 0}
            onPress={() => void send(true)}
          />
          <SecondaryAction
            icon="later"
            label="Some work was not done"
            consequence="Tap what happened on each task."
            disabled={busy}
            onPress={() => setItemised(true)}
          />
        </>
      ) : (
        <>
          {visit.work_tasks.map((task) => {
            const choice = choices[task.id];
            const reasonOptions =
              choice === "PARTIAL"
                ? PARTIAL_REASONS
                : choice === "NOT_DONE"
                  ? NOT_DONE_REASONS.map((option) => option.label)
                  : [];
            return (
              <View key={task.id} className="rounded-card border border-line bg-surface p-3">
                <Text className="px-1 text-lg font-extrabold text-text">
                  {task.label}
                  {task.quantity > 1 ? ` × ${task.quantity}` : ""}
                </Text>
                <View className="mt-2 flex-row gap-2">
                  {TASK_CHOICES.map((option) => {
                    const picked = choice === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: picked, disabled: busy }}
                        disabled={busy}
                        onPress={() => {
                          setChoices((current) => ({ ...current, [task.id]: option.value }));
                          setReasons((current) => {
                            const next = { ...current };
                            delete next[task.id];
                            return next;
                          });
                        }}
                        className={cn(
                          "min-h-18 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2",
                          picked ? "border-selected-line bg-selected-surface" : "border-line bg-surface-sunken",
                        )}
                      >
                        <Pictogram name={option.icon} size="md" className={picked ? "text-action-secondary" : "text-text-muted"} />
                        <Text className={cn("text-center text-xs font-bold", picked ? "text-action-secondary" : "text-text-muted")}>
                          {option.caption}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {reasonOptions.length > 0 ? (
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {reasonOptions.map((reason) => {
                      const picked = reasons[task.id] === reason;
                      return (
                        <Pressable
                          key={reason}
                          accessibilityRole="button"
                          accessibilityState={{ selected: picked }}
                          disabled={busy}
                          onPress={() => setReasons((current) => ({ ...current, [task.id]: reason }))}
                          className={cn(
                            "rounded-full border px-3 py-2",
                            picked ? "border-selected-line bg-selected-surface" : "border-line bg-surface",
                          )}
                        >
                          <Text className={cn("text-xs font-bold", picked ? "text-action-secondary" : "text-text-secondary")}>{reason}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
          {itemisedReady ? null : (
            <Text className="text-center text-sm font-semibold text-text-muted">
              {answered} of {visit.work_tasks.length} answered
            </Text>
          )}
          <BigAction
            tone="success"
            icon="yes"
            label={busy ? "Sending…" : "Send this report"}
            disabled={!itemisedReady || busy}
            onPress={() => void send(false)}
          />
          {stopped ? null : (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setItemised(false)} className="items-center py-1">
              <Text className="text-sm font-semibold text-action-secondary">Everything was done after all</Text>
            </Pressable>
          )}
        </>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: damage, disabled: busy }}
        accessibilityLabel="There was damage or a safety problem at this site"
        disabled={busy}
        onPress={() => setDamage((current) => !current)}
        className={cn(
          "min-h-12 flex-row items-center justify-center gap-2 rounded-[18px] border px-3",
          damage ? "border-danger-line bg-danger-surface" : "border-line bg-surface",
        )}
      >
        <Pictogram name="later" size="sm" className={damage ? "text-danger-text" : "text-text-muted"} />
        <Text className={cn("text-sm font-bold", damage ? "text-danger-text" : "text-text-muted")}>
          {damage ? "Damage or safety problem reported" : "Report damage or a safety problem"}
        </Text>
      </Pressable>
    </View>
  );
}

function BigAction({
  tone,
  icon,
  label,
  disabled,
  onPress,
}: {
  readonly tone: "success" | "secondary";
  readonly icon: PictogramName;
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "h-20 flex-row items-center justify-center gap-3 rounded-[20px]",
        tone === "success" ? "bg-success-text" : "bg-action-secondary",
        disabled && "opacity-60",
      )}
    >
      <Pictogram name={icon} size="lg" className="text-surface" />
      <Text className="text-xl font-bold text-surface">{label}</Text>
    </Pressable>
  );
}

function SecondaryAction({
  icon,
  label,
  consequence,
  tone = "neutral",
  disabled,
  onPress,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly consequence: string;
  readonly tone?: "neutral" | "danger";
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-15 flex-row items-center gap-3 rounded-[18px] border px-3.5 py-2.5",
        tone === "danger" ? "border-danger-line bg-danger-surface" : "border-line-strong bg-surface",
        disabled && "opacity-60",
      )}
    >
      <Pictogram name={icon} size="md" className={cn("shrink-0", tone === "danger" ? "text-danger-text" : "text-warning-text")} />
      <View className="min-w-0 flex-1 flex-col gap-0.5">
        <Text className={cn("text-base font-bold", tone === "danger" ? "text-danger-text" : "text-text")}>{label}</Text>
        <Text className={cn("text-xs font-medium leading-snug", tone === "danger" ? "text-danger-text" : "text-text-muted")}>{consequence}</Text>
      </View>
    </Pressable>
  );
}

function ReleaseAction({ visit }: { readonly visit: PartnerVisit }) {
  const abort = useAbortWork();
  const release = useReleaseBooking();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const aborting = canAbort(visit);
  const mutation = aborting ? abort : release;
  const label = aborting ? "Stop this job" : "Hand this job back";
  const prompt = aborting
    ? "Tell us what happened. Completed work is still settled — you will report it next."
    : "Tell us why so we can find a replacement quickly. There is no penalty for handing a job back.";
  const versioned = { bookingId: visit.id, expectedVersion: visit.version };

  if (!open) {
    return (
      <SecondaryAction
        icon="no"
        tone="danger"
        label={label}
        consequence={aborting ? "Work stops here. You still report what was done." : "You give up the job. No penalty."}
        disabled={mutation.isPending}
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <View className="rounded-card border border-line bg-surface p-3.5">
      {mutation.error ? <CommandFailure error={mutation.error} /> : null}
      <Text className="text-sm font-bold text-text">{label}</Text>
      <Text className="mt-1 text-sm leading-6 text-text-secondary">{prompt}</Text>
      <Textarea accessibilityLabel={label} className="mt-2 min-h-20 w-full" value={reason} onChangeText={setReason} maxLength={240} />
      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          disabled={reason.trim().length === 0 || mutation.isPending}
          onPress={() => mutation.mutate({ ...versioned, reason: reason.trim() })}
          className="h-11 flex-1 items-center justify-center rounded-2xl bg-danger-text px-4"
        >
          <Text className="text-sm font-bold text-surface">{label}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={() => setOpen(false)} className="h-11 items-center justify-center rounded-2xl border border-line bg-surface-sunken px-4">
          <Text className="text-sm font-bold text-text-muted">Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatusMedallion({ status }: { readonly status: VisitStatus }) {
  const copy = STATUS_COPY[status];
  return (
    <View accessibilityLiveRegion="polite" className={cn("min-h-14 flex-row items-center gap-3 rounded-card border px-3.5 py-3", MEDALLION_TONE[copy.tone])}>
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current/20">
        <Pictogram name={STATUS_PICTOGRAM[status]} size="md" />
      </View>
      <Text className="text-sm font-bold">Current status: {copy.label}</Text>
    </View>
  );
}

const STATUS_PICTOGRAM: Record<VisitStatus, PictogramName> = {
  CONFIRMED: "time",
  EN_ROUTE: "go",
  ARRIVED: "site",
  IN_PROGRESS: "doing",
  ABORTED: "stopped",
  COMPLETION_SUBMITTED: "held",
  COMPLETED: "done",
  PARTIALLY_COMPLETED: "done",
  DISPUTED: "later",
  RECOVERY_REQUIRED: "later",
  CANCELLED: "no",
};

const MEDALLION_TONE: Record<StatusTone, string> = {
  go: "border-selected-line bg-selected-surface text-action-secondary",
  wait: "border-warning-line bg-warning-surface text-warning-text",
  done: "border-success-line bg-success-surface text-success-text",
  stop: "border-danger-line bg-danger-surface text-danger-text",
};

function CommandFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");
  return (
    <ErrorState inline title={presentation.title} message={presentation.message} severity={presentation.severity} reference={presentation.reference} />
  );
}

function clockTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(at);
}

function calendarDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Date pending";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(at);
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining} min`;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}
