// Ported from frontend/apps/partner/features/enquiry/view/enquiry-detail-screen.tsx
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { describeError } from "@vsolve/query/native";
import { ConfirmAction, ErrorState, Spinner, Text, buttonStyles, formatMoney } from "@vsolve/mobile-ui";

import { CrewMixTable } from "@/features/crew-offer/view/crew-mix-table";
import { ProposalStatus } from "@/features/proposal/view/proposal-status";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";
import { Pictogram } from "@/features/work-stack/view/pictogram";

import { describeStatus, permissionsFor } from "../model/enquiry-state";
import { readEnquiryRecord, type EnquiryRecord } from "../model/wire";
import {
  isEnquiryForbidden,
  isKycRequired,
  useAcceptEnquiry,
  useDeclineEnquiry,
  usePartnerEnquiry,
  type EnquiryDetail,
} from "../queries";
import { ClarificationThread } from "./clarification-thread";
import { CustomerCard } from "./customer-card";
import { DeclineDialog } from "./decline-dialog";
import { FixedTimeOffer } from "./fixed-time-offer";
import { RequirementSummary } from "./requirement-summary";
import { SiteAddress } from "./site-address";
import { useVisitDay, type VisitDayControls } from "./use-visit-day";
import { VisitActionBar } from "./visit-action-bar";
import { VisitNowCard } from "./visit-now-card";

export function EnquiryDetailScreen({ invitationId }: { invitationId: string }) {
  const enquiry = usePartnerEnquiry(invitationId);

  if (enquiry.isPending) {
    return (
      <Screen>
        <View className="flex-1 flex-row items-center justify-center gap-2 py-16">
          <Spinner size="sm" />
          <Text className="text-text-secondary">Loading this enquiry…</Text>
        </View>
      </Screen>
    );
  }

  if (enquiry.isError || enquiry.data === undefined) {
    const forbidden = isEnquiryForbidden(enquiry.error);
    const presentation = enquiry.error ? describeError(enquiry.error, "read") : null;
    return (
      <Screen>
        <View className="px-4 py-6">
          <ErrorState
            title={forbidden ? "This enquiry is not yours to read" : (presentation?.title ?? "We could not load this enquiry")}
            message={
              forbidden
                ? "Vsolve has no enquiry with this reference on your account. If you followed a link from somewhere else, it may belong to another vendor."
                : (presentation?.message ?? "Check your connection and try again.")
            }
            severity={presentation?.severity}
            actionLabel={forbidden ? undefined : "Try again"}
            onAction={forbidden ? undefined : () => void enquiry.refetch()}
            reference={presentation?.reference}
          />
        </View>
      </Screen>
    );
  }

  return <EnquiryDecision key={invitationId} detail={enquiry.data} />;
}

function EnquiryDecision({ detail }: { readonly detail: EnquiryDetail }) {
  const router = useRouter();
  const enquiry = readEnquiryRecord(detail);
  const permissions = permissionsFor(enquiry.status);
  const isProject = enquiry.archetype === PROJECT_WORKSPACE;
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);
  const visit = useVisitDay(enquiry);
  const inFlight = accept.isPending || decline.isPending;
  const kycGate = isKycRequired(accept.error);
  const acceptPresentation = accept.error ? describeError(accept.error, "mutation") : null;
  const estimateHref = `/work/enquiries/${enquiry.id}/estimate`;
  const closed = !permissions.canAccept && !permissions.canQuote && !permissions.canDecline;
  const showsDestination = enquiry.siteAddress !== null;

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="flex-grow">
        <EnquiryHero enquiry={enquiry} isProject={isProject} showsEarning={visit !== null} />
        <View className="flex-col gap-3 px-4 py-4">
          {isProject ? <ProjectNow enquiry={enquiry} visit={visit} closed={closed} /> : null}
          <CrewMixTable lines={enquiry.crewMix} />
          {isProject && showsDestination ? <SiteAddress address={enquiry.siteAddress} approximateArea={enquiry.approximateArea} /> : null}
          {isProject && visit !== null ? <CustomerCard enquiry={enquiry} onMessage={() => setMessaging(true)} /> : null}
          {isProject ? (
            <ProposalStatus
              enquiryStatus={enquiry.status}
              invitationId={enquiry.id}
              requirementId={enquiry.requirementId}
              submitted={null}
              documentKind="estimate"
              onRevise={() => router.push(estimateHref as never)}
            />
          ) : null}
          {acceptPresentation ? (
            <ErrorState
              inline
              title={kycGate ? "Vsolve needs to verify you first" : acceptPresentation.title}
              message={acceptPresentation.message}
              severity={acceptPresentation.severity}
              actionLabel={kycGate ? "Finish verification" : "Try again"}
              onAction={kycGate ? () => router.push("/apply" as never) : () => accept.mutate()}
              reference={acceptPresentation.reference}
            />
          ) : null}
          {isProject && closed ? null : <RequirementSummary enquiry={enquiry} collapsible={visit !== null} />}
          {!isProject && permissions.canQuote ? <QuoteAction /> : null}
          {!isProject && closed ? <ClosedNotice enquiry={enquiry} /> : null}
        </View>
      </ScrollView>
      {isProject && visit !== null ? (
        <VisitActionBar
          controls={visit}
          enquiry={enquiry}
          estimateHref={estimateHref}
          arrivalHref={`/work/enquiries/${enquiry.id}/arrival`}
          estimateSubmitted={enquiry.status === "QUOTED"}
          showEstimateAction={enquiry.status !== "QUOTED"}
          onMessageCustomer={() => setMessaging(true)}
        />
      ) : null}
      {!isProject && (permissions.canAccept || permissions.canDecline) ? (
        <View className="flex-col gap-2.5 border-t border-line bg-surface px-4 pb-5 pt-3">
          {permissions.canAccept ? (
            <Pressable accessibilityRole="button" onPress={() => setConfirmingAccept(true)} disabled={inFlight} className="h-16 flex-row items-center justify-center gap-3 rounded-[20px] bg-success-text disabled:opacity-60">
              <Pictogram name="yes" size="md" className="text-surface" />
              <Text className="text-lg font-bold text-surface">Accept</Text>
            </Pressable>
          ) : null}
          {permissions.canDecline ? (
            <Pressable accessibilityRole="button" onPress={() => setDeclining(true)} disabled={inFlight} className="h-14 flex-row items-center justify-center gap-2.5 rounded-[18px] border border-line bg-surface disabled:opacity-60">
              <Pictogram name="no" size="md" className="text-text-muted" />
              <Text className="text-base font-bold text-text-secondary">Decline</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ClarificationThread enquiry={enquiry} open={messaging} onOpenChange={setMessaging} />
      <ConfirmAction
        open={confirmingAccept}
        onOpenChange={setConfirmingAccept}
        title="Accept this enquiry"
        consequence="Accepting takes one of the customer's quote slots and holds your availability for these dates. You are not committing to a price yet — your quote comes next."
        confirmLabel="Accept"
        pending={accept.isPending}
        onConfirm={() => accept.mutate(undefined, { onSettled: () => setConfirmingAccept(false) })}
      />
      <DeclineDialog
        open={declining}
        onOpenChange={setDeclining}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(reasonCode) => decline.mutate({ reasonCode }, { onSuccess: () => setDeclining(false) })}
      />
    </Screen>
  );
}

function EnquiryHero({ enquiry, isProject, showsEarning }: { readonly enquiry: EnquiryRecord; readonly isProject: boolean; readonly showsEarning: boolean }) {
  const showsLocality = enquiry.siteAddress === null && enquiry.approximateArea.trim() !== "";
  return (
    <View className="flex-row items-center justify-between gap-3 bg-navy-900 p-4">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-navy-200">{isProject ? "Project enquiry" : "Workforce enquiry"}</Text>
        <Text numberOfLines={1} className="text-[1.1875rem] font-bold leading-snug text-surface">{enquiry.serviceName === "" ? "Enquiry" : enquiry.serviceName}</Text>
        {showsLocality ? (
          <View className="flex-row items-center gap-1">
            <Pictogram name="distance" size="xs" className="text-navy-100" />
            <Text numberOfLines={1} className="text-xs font-semibold text-navy-100">Near {enquiry.approximateArea}</Text>
          </View>
        ) : null}
      </View>
      {isProject && enquiry.status === "QUOTED" ? (
        <Text className="shrink-0 rounded-full bg-success-surface px-3 py-2 text-xs font-extrabold text-success-text">Estimate sent</Text>
      ) : showsEarning && enquiry.fixedVisitEarningPaise !== null ? (
        <View className="shrink-0 items-end rounded-2xl bg-navy-800 px-3 py-2">
          <Text className="text-base font-extrabold leading-none text-surface">{formatMoney(enquiry.fixedVisitEarningPaise)}</Text>
          <Text className="mt-1 text-[0.625rem] font-bold uppercase tracking-wide text-navy-200">for this visit</Text>
        </View>
      ) : (
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-500">
          <Pictogram name="new" size="md" className="text-surface" />
        </View>
      )}
    </View>
  );
}

function ProjectNow({ enquiry, visit, closed }: { readonly enquiry: EnquiryRecord; readonly visit: VisitDayControls | null; readonly closed: boolean }) {
  if (visit !== null) return <VisitNowCard controls={visit} enquiry={enquiry} estimateSubmitted={enquiry.status === "QUOTED"} />;
  if (enquiry.status === "INVITED" || enquiry.status === "ACCEPTED") return <FixedTimeOffer enquiry={enquiry} />;
  return closed ? <ClosedNotice enquiry={enquiry} /> : null;
}

function QuoteAction() {
  return (
    <ErrorState
      inline
      severity="info"
      title="No quote form for this yet"
      message="Vsolve cannot show a quote form for this kind of work in this version of the app. Support can take your quote over the phone."
    />
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <View className="flex-1 bg-canvas">{children}</View>;
}

function ClosedNotice({ enquiry }: { readonly enquiry: EnquiryRecord }) {
  const router = useRouter();
  const status = describeStatus(enquiry.status, enquiry.declineReasonCode);
  return (
    <View className="flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-sunken">
        <Pictogram name="stopped" size="lg" className="text-text-muted" />
      </View>
      <Text className="text-center text-lg font-extrabold tracking-[-0.02em] text-text">{status.label}</Text>
      <Text className="max-w-xs text-center text-sm leading-6 text-text-secondary">{status.meaning}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push("/work/all" as never)} className={buttonStyles({ variant: "outline", className: "mt-2" })}>
        <Text className="text-sm font-semibold text-text">Back to Work</Text>
      </Pressable>
    </View>
  );
}
