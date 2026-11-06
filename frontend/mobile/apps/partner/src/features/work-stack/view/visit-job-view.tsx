// Ported from frontend/apps/partner/features/work-stack/view/visit-job-view.tsx
import { serverClock } from "@vsolve/api-client";
import { describeError, useServerCountdown } from "@vsolve/query/native";
import { ErrorState, Text, cn, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
  useMarkArrived,
  useMarkCustomerUnavailable,
  useMarkEnRoute,
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
import { isInAppMapAvailable, useAreaCenter, usePartnerPosition, useVisitRoute } from "@/features/work/route";

import { formatStartsIn, visitTimeline, type TimelineStep } from "../model/visit-timeline";
import { BookingSupport } from "./booking-support";
import { CodeBoxes } from "./code-boxes";
import { CompletionRating } from "./completion-rating";
import { JobSheet, SHEET_SNAPS } from "./job-sheet";
import { Pictogram, type PictogramName } from "./pictogram";
import { ReleaseAction } from "./release-action";
import { SlideToConfirm } from "./slide-to-confirm";
import { VisitAreaMap } from "./visit-area-map";
import { VisitRouteMap, describeRoute } from "./visit-route-map";

/** Statuses that are about getting to the Customer: the map is the screen. */
const MAP_STAGES: readonly VisitStatus[] = ["CONFIRMED", "EN_ROUTE", "ARRIVED"];

/** The shortest start code the Partner may submit; the server decides whether it is right. */
const MIN_CODE_DIGITS = 4;

/**
 * The visit screen, one layout per stage (owner decision, 5 November 2026; spec in
 * `guide/live-job-screens-spec.md`).
 *
 * Getting there (booked, on the way, arrived): the map fills the screen and a bottom sheet carries
 * only what that stage needs, with the one primary action pinned at the bottom. Working and after:
 * no map and no address. Once the start code has been checked the Partner is already at the door,
 * so the screen is the work itself.
 */
export function VisitJobView({ visit }: { readonly visit: PartnerVisit }) {
  const enRoute = useMarkEnRoute();
  const arrived = useMarkArrived();
  const unavailable = useMarkCustomerUnavailable();
  useRefreshVisitAtGates(visit);
  const gate = waitingGate(visit, serverClock.now());
  const commands = {
    enRoute,
    arrived,
    unavailable,
    busy: enRoute.isPending || arrived.isPending || unavailable.isPending,
    error: enRoute.error ?? arrived.error ?? unavailable.error,
  };

  return MAP_STAGES.includes(visit.status) ? (
    <MapStage visit={visit} gate={gate} commands={commands} />
  ) : (
    <WorkStage visit={visit} />
  );
}

type Commands = {
  readonly enRoute: ReturnType<typeof useMarkEnRoute>;
  readonly arrived: ReturnType<typeof useMarkArrived>;
  readonly unavailable: ReturnType<typeof useMarkCustomerUnavailable>;
  readonly busy: boolean;
  readonly error: unknown;
};

function jobTitleText(visit: PartnerVisit): string {
  const durableTitle = visit.display_title?.trim() || null;
  const [first, ...rest] = visit.work_tasks;
  return `${durableTitle ?? (first === undefined ? "Your job" : first.label)}${durableTitle === null && rest.length > 0 ? ` +${rest.length} more` : ""}`;
}

/* ---------------------------------------------------------------------------
   Getting there: full-screen map + bottom sheet
   --------------------------------------------------------------------------- */

function MapStage({ visit, gate, commands }: { readonly visit: PartnerVisit; readonly gate: WaitingGate | null; readonly commands: Commands }) {
  const verify = useVerifyStartOtp();
  // The area this screen really has (under the app's own header), measured, not the phone's height.
  const [areaHeight, setAreaHeight] = useState(0);
  const [code, setCode] = useState("");
  const [showAddress, setShowAddress] = useState(false);

  const status = STATUS_COPY[visit.status];
  const versioned = { bookingId: visit.id, expectedVersion: visit.version };
  const atDoor = visit.status === "ARRIVED";
  const mapsOn = isInAppMapAvailable();
  const location = usePartnerPosition(mapsOn);
  const origin = location.position;
  const route = useVisitRoute(visit, mapsOn ? origin : null);
  const area = visit.approximate_area?.trim() || null;
  const areaCenter = useAreaCenter(mapsOn ? area : null, origin);
  const contact = visitContact(visit);
  const money = visit.earning ?? visit.estimated_earning;
  const routeShown = mapsOn && route.data !== undefined;
  const areaShown = !routeShown && origin !== null && area !== null && (areaCenter.data ?? null) !== null;
  const mapShown = routeShown || areaShown;
  const booked = visit.status === "CONFIRMED";
  const startSnap = atDoor || !mapShown ? 1 : 0;
  const bottomInset = areaHeight * SHEET_SNAPS[startSnap]!;
  // The timeline already says when "I am on my way" opens; a notice only adds what it cannot.
  const showGateNotice = gate !== null && !(booked && gate.state === "not_yet");

  let footer: React.ReactNode = null;
  if (canGoEnRoute(visit)) {
    footer = <BigAction tone="secondary" icon="go" label="I am on my way" disabled={commands.busy} onPress={() => commands.enRoute.mutate(versioned)} />;
  } else if (canArrive(visit)) {
    footer = <SlideToConfirm label="Slide: I have arrived" disabled={commands.busy} onConfirm={() => commands.arrived.mutate(versioned)} />;
  } else if (canStartWork(visit)) {
    footer = (
      <BigAction
        tone="success"
        icon="power"
        label="Start work"
        disabled={code.length < MIN_CODE_DIGITS || verify.isPending}
        onPress={() => verify.mutate({ bookingId: visit.id, expectedVersion: visit.version, code })}
      />
    );
  }

  return (
    <View className="flex-1 bg-surface" onLayout={(event) => setAreaHeight(event.nativeEvent.layout.height)}>
      {routeShown ? (
        <VisitRouteMap route={route.data!} bottomInset={bottomInset} topInset={0} />
      ) : areaShown ? (
        <VisitAreaMap area={area!} center={areaCenter.data!} partner={origin!} bottomInset={bottomInset} />
      ) : (
        <StartsInHero visit={visit} locationOff={mapsOn && location.unavailable} onTurnOnLocation={location.turnOn} />
      )}

      {/* Floating over the map. The app's own header already has Back. */}
      <View pointerEvents="box-none" className="absolute inset-x-0 top-0 flex-row items-start justify-between gap-2 px-4 pt-3">
        <View pointerEvents="box-none" className="items-start gap-2">
          <Text className="rounded-full bg-surface px-4 py-2 text-xs font-extrabold uppercase tracking-[0.05em] text-text shadow-md">{status.label}</Text>
          {routeShown && !atDoor ? (
            <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2 rounded-full bg-navy-900 px-4 py-2 shadow-md">
              <Pictogram name="time" size="sm" className="text-action" />
              <Text className="text-sm font-extrabold text-surface">{describeRoute(route.data!)}</Text>
            </View>
          ) : null}
        </View>
        {mapShown && booked ? <StartsInCard start={visit.scheduled_start} /> : null}
      </View>

      {areaHeight > 0 ? (
        <JobSheet key={visit.status} accessibilityLabel="Job details" containerHeight={areaHeight} initialSnap={startSnap as 0 | 1} footer={footer}>
        {commands.error ? <CommandFailure error={commands.error} /> : null}
        {verify.error ? <CommandFailure error={verify.error} /> : null}

        {atDoor ? (
          <View className="gap-4">
            <View>
              <Text className="text-xl font-extrabold text-text">{contact ? `Ask ${contact.firstName} for the start code` : "Ask the customer for the start code"}</Text>
              <Text className="mt-1 text-sm leading-5 text-text-secondary">Type the digits they read out to begin the work.</Text>
            </View>
            <CodeBoxes value={code} onChange={setCode} error={verify.isError} />
          </View>
        ) : (
          <View>
            <View className="flex-row items-start justify-between gap-3">
              <Text className="min-w-0 flex-1 text-xl font-extrabold leading-tight text-text">{jobTitleText(visit)}</Text>
              {money ? <Text className="text-xl font-extrabold text-success-text">{formatMoney(money.net_paise)}</Text> : null}
            </View>
            <Text className="mt-1 text-sm font-medium text-text-secondary">
              {calendarDate(visit.scheduled_start)} · {clockTime(visit.scheduled_start) ?? "Time pending"} · {durationLabel(visit.estimated_duration_minutes)} work
            </Text>
          </View>
        )}

        {booked ? <NextSteps visit={visit} /> : null}

        {showGateNotice && gate !== null ? <GateNotice gate={gate} /> : null}

        {atDoor ? (
          <View className="gap-3">
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAddress }} onPress={() => setShowAddress((open) => !open)} className="min-h-11 flex-row items-center gap-2">
              <Pictogram name="site" size="sm" className="shrink-0 text-text-muted" />
              <Text numberOfLines={showAddress ? undefined : 1} className="min-w-0 flex-1 text-sm font-semibold text-text-secondary">
                {visit.site_address ? addressLine(visit.site_address) : (visit.approximate_area ?? "Customer address")}
              </Text>
              <Text className="text-xs font-bold text-action-secondary">{showAddress ? "Hide" : "Show"}</Text>
            </Pressable>
            <View className="flex-row gap-2">
              {contact !== null ? <CallButton name={contact.firstName} phone={contact.phone} /> : null}
            </View>
            {visit.customer_unavailable_wait_started_at === null ? (
              <SecondaryAction icon="later" label="Nobody is here" consequence="Starts a paid wait. You keep the job." disabled={commands.busy} onPress={() => commands.unavailable.mutate(versioned)} />
            ) : null}
          </View>
        ) : (
          <LocationBlock visit={visit} />
        )}

        {atDoor ? null : <ServiceDetails visit={visit} />}

        <View className="gap-2">
          <SectionTitle>Need help?</SectionTitle>
          <BookingSupport reference={visit.id}>
            {canAbort(visit) || canRelease(visit) ? <ReleaseAction visit={visit} /> : null}
          </BookingSupport>
        </View>
        </JobSheet>
      ) : null}
    </View>
  );
}

/** The server's time until the start, reworded every half minute. */
function useStartsIn(start: string): string | null {
  const countdown = useServerCountdown(start, 30_000);
  return countdown === null ? null : formatStartsIn(countdown.remainingMs);
}

/** The small card over the map. Hidden once the start time has passed. */
function StartsInCard({ start }: { readonly start: string }) {
  const startsIn = useStartsIn(start);
  if (startsIn === null) return null;
  return (
    <View accessibilityLabel={`Starts in ${startsIn}`} className="items-end rounded-2xl bg-surface px-3.5 py-2 shadow-md">
      <Text className="text-[0.625rem] font-bold uppercase tracking-[0.06em] text-text-muted">Starts in</Text>
      <Text className="text-lg font-extrabold text-text">{startsIn}</Text>
    </View>
  );
}

/**
 * The top of the screen when no map can be drawn: location is off, or the phone cannot place the
 * area. The countdown carries it, so the screen is never empty.
 */
function StartsInHero({ visit, locationOff, onTurnOnLocation }: { readonly visit: PartnerVisit; readonly locationOff: boolean; readonly onTurnOnLocation: () => void }) {
  const startsIn = useStartsIn(visit.scheduled_start);
  const area = visit.approximate_area?.trim() || null;
  return (
    <View className="absolute inset-0 bg-navy-900 px-5 pt-16">
      <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-navy-200">{startsIn === null ? "Start time" : "Starts in"}</Text>
      <Text className="mt-1 text-[2.5rem] font-extrabold leading-tight tracking-[-0.025em] text-surface">
        {startsIn ?? clockTime(visit.scheduled_start) ?? "Time pending"}
      </Text>
      <Text className="mt-1 text-sm font-semibold text-navy-200">
        {calendarDate(visit.scheduled_start)} · {clockTime(visit.scheduled_start) ?? "Time pending"}
        {area === null ? "" : ` · Near ${area}`}
      </Text>
      {locationOff ? (
        <Pressable
          accessibilityRole="button"
          onPress={onTurnOnLocation}
          className="mt-4 min-h-11 flex-row items-center gap-2 self-start rounded-full bg-surface px-4 active:opacity-80"
        >
          <Pictogram name="distance" size="sm" className="text-action-secondary" />
          <Text className="text-sm font-bold text-text">Turn on location to see the map</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionTitle({ children }: { readonly children: string }) {
  return <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-text-muted">{children}</Text>;
}

/** The plan for a booked job, one line per step, on the server's times. */
function NextSteps({ visit }: { readonly visit: PartnerVisit }) {
  const steps = visitTimeline(visit);
  return (
    <View className="gap-3">
      <SectionTitle>What happens next</SectionTitle>
      <View>
        {steps.map((step, index) => (
          <NextStepRow key={step.key} step={step} start={visit.scheduled_start} last={index === steps.length - 1} />
        ))}
      </View>
    </View>
  );
}

function NextStepRow({ step, start, last }: { readonly step: TimelineStep; readonly start: string; readonly last: boolean }) {
  const current = step.state === "current";
  const done = step.state === "done";
  const sameDay = calendarDate(step.at) === calendarDate(start);
  const time = clockTime(step.at) ?? "";
  return (
    <View accessibilityLabel={`${step.label}, ${sameDay ? time : `${calendarDate(step.at)} ${time}`}${done ? ", done" : current ? ", next up" : ""}`} className="flex-row gap-3">
      <View className="w-6 items-center">
        <View
          className={cn(
            "h-6 w-6 items-center justify-center rounded-full border-2",
            done ? "border-success-text bg-success-text" : current ? "border-action bg-action-soft" : "border-line bg-surface",
          )}
        >
          {done ? <Pictogram name="yes" size="sm" className="text-surface" /> : current ? <View className="h-2.5 w-2.5 rounded-full bg-action" /> : null}
        </View>
        {last ? null : <View className={cn("min-h-5 w-0.5 flex-1", done ? "bg-success-text" : "bg-line")} />}
      </View>
      <View className={cn("min-w-0 flex-1 flex-row items-start justify-between gap-3", last ? "" : "pb-4")}>
        <Text className={cn("min-w-0 flex-1 text-sm leading-6", current ? "font-extrabold text-text" : done ? "font-medium text-text-muted" : "font-medium text-text-secondary")}>{step.label}</Text>
        <Text className={cn("text-sm leading-6", current ? "font-extrabold text-text" : "font-semibold text-text-muted")}>{sameDay ? time : `${calendarDate(step.at)}, ${time}`}</Text>
      </View>
    </View>
  );
}

function addressLine(address: NonNullable<PartnerVisit["site_address"]>): string {
  return [address.line1, address.line2, address.landmark, address.locality, address.city, address.postal_code].filter((part) => part.trim() !== "").join(", ");
}

function CallButton({ name, phone }: { readonly name: string; readonly phone: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Call ${name}`}
      onPress={() => void Linking.openURL(`tel:${phone}`)}
      className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] border border-line-strong bg-surface active:bg-surface-sunken"
    >
      <Pictogram name="call" size="md" className="text-action-secondary" />
      <Text numberOfLines={1} className="text-base font-bold text-text">Call {name}</Text>
    </Pressable>
  );
}

/**
 * Where the job is and who to ask for, once the server has released them. Before that the timeline
 * says when they arrive, so there is nothing to draw here.
 */
function LocationBlock({ visit }: { readonly visit: PartnerVisit }) {
  const address = visit.site_address;
  if (address === null) return null;

  const contact = visitContact(visit);
  const navigate = navigationHref(visit);
  const locality = [address.locality, address.city, address.postal_code].filter((part) => part.trim() !== "").join(", ");

  return (
    <View className="rounded-card border border-success-line bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-success-surface">
          <Pictogram name="site" size="md" className="text-success-text" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-text-muted">Customer address</Text>
          <Text className="mt-0.5 text-base font-extrabold leading-snug text-text">{address.line1}</Text>
          {address.line2.trim() !== "" ? <Text className="text-sm leading-5 text-text">{address.line2}</Text> : null}
          {address.landmark.trim() !== "" ? <Text className="text-sm leading-5 text-text-secondary">Near {address.landmark}</Text> : null}
          {locality !== "" ? <Text className="text-sm leading-5 text-text-secondary">{locality}</Text> : null}
        </View>
      </View>
      <View className="mt-4 flex-row gap-2">
        {navigate !== null ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Navigate with Google Maps"
            onPress={() => void Linking.openURL(navigate)}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] bg-action-secondary active:opacity-90"
          >
            <Pictogram name="go" size="md" className="text-surface" />
            <Text className="text-base font-bold text-surface">Navigate</Text>
          </Pressable>
        ) : null}
        {contact !== null ? <CallButton name={contact.firstName} phone={contact.phone} /> : null}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------------------
   Working and after: no map, no address
   --------------------------------------------------------------------------- */

function WorkStage({ visit }: { readonly visit: PartnerVisit }) {
  const status = STATUS_COPY[visit.status];
  const money = visit.earning ?? visit.estimated_earning;
  const contact = visitContact(visit);
  const [menuOpen, setMenuOpen] = useState(false);
  const working = visit.status === "IN_PROGRESS" || visit.status === "ABORTED";

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-8">
      <View className="bg-navy-900 px-4 pb-6 pt-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="rounded-full border border-surface/25 bg-surface/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.05em] text-surface">{status.label}</Text>
          {canAbort(visit) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More options"
              accessibilityState={{ expanded: menuOpen }}
              onPress={() => setMenuOpen((open) => !open)}
              className="h-11 w-11 items-center justify-center rounded-2xl bg-surface/13"
            >
              <Pictogram name="more" size="md" className="text-surface" />
            </Pressable>
          ) : null}
        </View>
        <Text className="mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-navy-200">Service visit</Text>
        <JobTitle visit={visit} />
        {money ? (
          <View className="mt-4 w-[60%]">
            <HeroFact icon="money" label={visit.earning ? "Final earning" : "Estimated earning"} value={formatMoney(money.net_paise)} />
          </View>
        ) : null}
      </View>

      <View className="flex-col gap-4 px-4 pt-4">
        {menuOpen && canAbort(visit) ? (
          <View className="overflow-hidden rounded-card border border-line bg-surface">
            <ReleaseAction visit={visit} />
          </View>
        ) : null}
        {visit.status === "IN_PROGRESS" && contact !== null ? (
          <View className="flex-row">
            <CallButton name={contact.firstName} phone={contact.phone} />
          </View>
        ) : null}
        {working ? <ServiceDetails visit={visit} /> : null}
        {canReport(visit) ? <JobReport visit={visit} /> : null}
        {isWaiting(visit) ? (
          <View className="gap-3">
            <StatusMedallion status={visit.status} />
            <Text className="px-1 text-sm leading-5 text-text-secondary">{STATUS_GUIDANCE[visit.status]}</Text>
          </View>
        ) : null}
        <CompletionRating subject="booking" id={visit.id} isComplete={visit.status === "COMPLETED" || visit.status === "PARTIALLY_COMPLETED"} />
        <BookingSupport reference={visit.id} />
      </View>
    </ScrollView>
  );
}

function JobTitle({ visit }: { readonly visit: PartnerVisit }) {
  return <Text className="mt-1 max-w-[28ch] text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-surface">{jobTitleText(visit)}</Text>;
}

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
    <View className="gap-4">
      {visit.requirements.length > 0 ? (
        <View className="gap-2">
          <SectionTitle>Bring with you</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {visit.requirements.map((requirement) => (
              <Text key={requirement} className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-xs font-semibold capitalize text-text-secondary">
                {requirement}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      <View className="gap-2">
        <SectionTitle>{"What you'll do"}</SectionTitle>
        {visit.service_lines.length > 0 ? (
          visit.service_lines.map((line) => (
            <View key={line.line_id} className="flex-row items-center gap-2.5">
              <Pictogram name="yes" size="sm" className="shrink-0 text-success-text" />
              <Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text">{line.service_label}</Text>
              {line.quantity > 1 ? <Text className="shrink-0 text-xs font-bold text-text-secondary">Qty {line.quantity}</Text> : null}
            </View>
          ))
        ) : (
          <View className="flex-row items-center gap-2.5">
            <Pictogram name="yes" size="sm" className="shrink-0 text-success-text" />
            <Text className="text-sm font-semibold leading-5 text-text">{visit.display_title?.trim() || "Your booked service"}</Text>
          </View>
        )}
      </View>
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
  disabled,
  onPress,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly consequence: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn("min-h-15 flex-row items-center gap-3 rounded-[18px] border border-line-strong bg-surface px-3.5 py-2.5", disabled && "opacity-60")}
    >
      <Pictogram name={icon} size="md" className="shrink-0 text-warning-text" />
      <View className="min-w-0 flex-1 flex-col gap-0.5">
        <Text className="text-base font-bold text-text">{label}</Text>
        <Text className="text-xs font-medium leading-snug text-text-muted">{consequence}</Text>
      </View>
    </Pressable>
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
