// Ported from frontend/apps/customer/features/requirement/view/request-detail-screen.tsx
import { categorizeError, describeError, isFreelyEditable, useServerCountdown } from "@vsolve/query/native";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Readout,
  formatMoney,
  Skeleton,
  Text,
  Timeline,
  TimelineEvent,
  buttonStyles,
} from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { useAddresses } from "@/features/addresses/queries";
import { toEngagementLists } from "@/features/engagement/adapters";
import { useEngagements } from "@/features/engagement/queries";
import { toArchetype, toRequestHeader, toServerAttachmentRows, toTimelineEvents, type RequestRowView, type TimelineEventView } from "@/features/requirement/adapters";
import { engagementDestination } from "@/features/requirement/model/engagement-redirect";
import {
  isClosedState,
  isOurFailure,
  requestState,
  showsQuoteDeadline,
  splitLede,
} from "@/features/requirement/model/request-state";
import { useQuoteTeasers } from "@/features/access/queries";
import { useRequirement, useRequirementTimeline } from "@/features/requirement/queries";
import { REQUEST_STATE_COPY } from "@/features/requirement/view/request-state";
import {
  bookCrewFeeHref,
  engagementHref,
  receiptHref,
  requestQuotesHref,
} from "@/lib/routes";

export function titleForSlug(categorySlug: string): string {
  const words = categorySlug.replace(/-/g, " ").trim();
  if (words.length === 0) return "Your request";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function addressSummary(
  addresses: readonly { id: string; line1: string; locality: string; city: string; postal_code: string }[],
  addressId: string | null,
): string | null {
  if (addressId === null) return null;
  const address = addresses.find((candidate) => candidate.id === addressId);
  if (address === undefined) return null;
  const locality = address.locality || address.city;
  const place = [address.line1, locality].filter((part) => part.trim() !== "").join(", ");
  return place === "" ? address.postal_code : `${place} - ${address.postal_code}`;
}

function formatStartDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short" }).format(date);
}

function formatSentDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function budgetLabel(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise === null && maxPaise === null) return null;
  if (minPaise === null && maxPaise !== null) return `Up to ${formatMoney(maxPaise)}`;
  if (minPaise !== null && maxPaise === null) return `From ${formatMoney(minPaise)}`;
  if (minPaise === maxPaise) return formatMoney(minPaise!);
  return `${formatMoney(minPaise!)} - ${formatMoney(maxPaise!)}`;
}

function isSameWords(a: string, b: string): boolean {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalise(a) === normalise(b);
}

export function RequestDetail({ requirementId }: { requirementId: string }) {
  const router = useRouter();
  const requirementQuery = useRequirement(requirementId);
  const timelineQuery = useRequirementTimeline(requirementId);
  const draft = requirementQuery.data ?? null;

  useEffect(() => {
    const destination = engagementDestination(draft?.engagement_id ?? null);
    if (destination !== null) router.replace(destination as never);
  }, [draft?.engagement_id, router]);

  const teasersQuery = useQuoteTeasers(requirementId, draft !== null && !isFreelyEditable(draft.status));
  const timeline = timelineQuery.data;
  const timelineEvents = timeline === undefined ? [] : toTimelineEvents(timeline);
  const request = draft === null ? null : toRequestHeader(draft, titleForSlug(draft.category_slug));
  const addresses = useAddresses(draft !== null);
  const requestFacts = {
    addressLine: addressSummary(addresses.data ?? [], draft?.address_id ?? null),
    startsOn: formatStartDay(draft?.service_by ?? null),
  };
  const budget = budgetLabel(draft?.budget_min_paise ?? null, draft?.budget_max_paise ?? null);
  const submittedAt = timelineEvents.find((event) => event.type === "REQUIREMENT_SUBMITTED")?.at ?? null;
  const sentDay = formatSentDay(submittedAt);
  const subtitle =
    draft === null
      ? null
      : [
          isSameWords(draft.service_name, titleForSlug(draft.category_slug)) ? null : draft.service_name,
          sentDay === null ? null : `sent ${sentDay}`,
        ]
          .filter(Boolean)
          .join(" · ") || null;
  const facts =
    draft === null
      ? []
      : [
          requestFacts.addressLine === null ? null : { label: "Where", value: requestFacts.addressLine },
          requestFacts.startsOn === null ? null : { label: "Needed by", value: requestFacts.startsOn },
          budget === null ? null : { label: "Budget you gave", value: budget },
        ].filter((fact): fact is { label: string; value: string } => fact !== null);

  const support = (
    <Link href="/account/messages" asChild>
      <Pressable className={buttonStyles({ variant: "outline" })}>
        <Text className="text-sm font-semibold text-text">Talk to us about this</Text>
      </Pressable>
    </Link>
  );

  return (
    <RequestDetailLayout
      visualLifecycle={draft !== null && draft.status !== "DRAFT" && toArchetype(draft) === "A5_CUSTOM_PROJECT"}
      railRecords={<BookingRecords requirementId={requirementId} />}
      request={request}
      headerAction={
        (teasersQuery.data?.teasers.length ?? 0) > 0 ? (
          <Link href={requestQuotesHref(requirementId)} asChild>
            <Pressable className={buttonStyles({ variant: "outline", className: "w-full" })}>
              <Text className="text-sm font-semibold text-text">Compare Quotes</Text>
            </Pressable>
          </Link>
        ) : undefined
      }
      subtitle={subtitle}
      facts={facts}
      attachments={
        draft === null ? null : (
          <View className="gap-2">
            {toServerAttachmentRows(draft.attachments).map((row) => (
              <Text key={row.id} className="text-sm text-text">
                {row.name}
              </Text>
            ))}
          </View>
        )
      }
      isRequestPending={requirementQuery.isPending}
      requestError={requirementQuery.error}
      events={timelineEvents}
      isTimelinePending={timelineQuery.isPending}
      timelineError={timelineQuery.error}
      onRetryRequest={() => void requirementQuery.refetch()}
      onRetryTimeline={() => void timelineQuery.refetch()}
      supportAction={support}
    >
      {draft !== null ? (
        <View className="gap-2">
          <Text className="text-sm text-text-secondary">{draft.service_name}</Text>
          <Link href={requestQuotesHref(requirementId)} asChild>
            <Pressable>
              <Text className="text-sm font-semibold text-text-link">Quotes</Text>
            </Pressable>
          </Link>
          <Link href={bookCrewFeeHref(requirementId)} asChild>
            <Pressable>
              <Text className="text-sm font-semibold text-text-link">Book a crew</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </RequestDetailLayout>
  );
}

function BookingRecords({ requirementId }: { requirementId: string }) {
  const query = useEngagements();
  const engagements = (query.data?.pages ?? []).flatMap((page) => page.results);
  const lists = toEngagementLists(engagements);
  const row =
    [...lists.workforce, ...lists.projects].find((candidate) => candidate.requirementId === requirementId) ?? null;
  if (row === null) return null;
  const isProject = row.mode === "managed";
  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface">
      <Link href={engagementHref(row.engagementId)} asChild>
        <Pressable className="border-b border-line px-4 py-3">
          <Text className="text-sm font-semibold text-text">{isProject ? "Your project" : "Your booking"}</Text>
          <Text className="text-sm text-text-secondary">
            {row.progress.total > 0
              ? `${row.progress.done} of ${row.progress.total} ${isProject ? "stages" : "days"} done`
              : "Open the workspace"}
          </Text>
        </Pressable>
      </Link>
      {isProject ? (
        <Link href={engagementHref(row.engagementId)} asChild>
          <Pressable className="border-b border-line px-4 py-3">
            <Text className="text-sm font-semibold text-text">Funded so far</Text>
            <Text className="text-sm text-text-secondary">
              {row.fundedTotalLabel} of {row.stagedTotalLabel}
            </Text>
          </Pressable>
        </Link>
      ) : null}
      <Link href={receiptHref(row.engagementId)} asChild>
        <Pressable className="px-4 py-3">
          <Text className="text-sm font-semibold text-text">Payment receipt</Text>
          <Text className="text-sm text-text-secondary">What you have been charged</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const TIMELINE_PREVIEW = 3;

function RequestDetailLayout({
  request,
  isRequestPending,
  requestError,
  subtitle,
  facts,
  headerAction,
  events,
  isTimelinePending,
  timelineError,
  onRetryRequest,
  onRetryTimeline,
  supportAction,
  attachments,
  railRecords,
  visualLifecycle,
  children,
}: {
  request: RequestRowView | null;
  isRequestPending: boolean;
  requestError: unknown;
  subtitle: string | null;
  facts: readonly { label: string; value: string }[];
  headerAction?: ReactNode;
  events: readonly TimelineEventView[];
  isTimelinePending: boolean;
  timelineError: unknown;
  onRetryRequest: () => void;
  onRetryTimeline: () => void;
  supportAction?: ReactNode;
  attachments?: ReactNode;
  railRecords?: ReactNode;
  visualLifecycle?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const countdown = useServerCountdown(request?.deadlineAt ?? null, 60_000);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const shownEvents = showAllEvents ? events : events.slice(0, TIMELINE_PREVIEW);
  const hiddenCount = events.length - shownEvents.length;
  const remainingMs = countdown?.remainingMs ?? null;
  const remainingAnnounce = countdown?.isExpired === false ? countdown.announce : null;
  const state = request === null ? null : requestState({ status: request.status, quoteDeadlineRemainingMs: remainingMs });
  const copy = state === null ? null : REQUEST_STATE_COPY[state];
  const hideStateSummary =
    state === "MATCHING" || state === "ENGAGED" || (visualLifecycle === true && state !== null && !isClosedState(state));
  const hideInlineFacts = state === "MATCHING";
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    onRetryRequest();
    onRetryTimeline();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-4 pb-28 pt-5"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="mb-4 flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/activity" as never);
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface"
        >
          <ChevronLeft size={20} color="#00112e" />
        </Pressable>
        <Text className="text-sm font-semibold text-text-muted">
          Bookings › Requests › <Text className="text-sm font-extrabold text-text">{request?.title ?? "Request"}</Text>
        </Text>
      </View>

      {isRequestPending || (request === null && requestError === null) ? (
        <View accessibilityState={{ busy: true }}>
          <Text className="sr-only">Loading this request</Text>
          <Skeleton className="h-28 w-full" />
        </View>
      ) : request === null || state === null || copy === null ? (
        <RequestHeaderError error={requestError} onRetry={onRetryRequest} />
      ) : (
        <>
          <View className="gap-3">
            <Text className="text-[1.75rem] font-extrabold leading-tight text-text">{request.title}</Text>
            {subtitle !== null ? <Text className="text-sm font-medium text-text-secondary">{subtitle}</Text> : null}
            {headerAction}
          </View>
          {hideStateSummary ? null : (
            <View className="min-h-[205px] gap-2 rounded-card border border-line bg-surface p-4">
              <Badge tone={copy.tone}>{copy.label}</Badge>
              <Text className="text-lg font-bold text-text">
                {headlineForRequest(request, state, splitLede(copy.explanation).lede)}
              </Text>
              {splitLede(copy.explanation).rest ? (
                <Text className="text-sm text-text-secondary">{splitLede(copy.explanation).rest}</Text>
              ) : null}
              {copy.nextStep ? <Text className="text-sm font-semibold text-text">{copy.nextStep}</Text> : null}
              {isOurFailure(state) ? supportAction : null}
              {buildReadout(request, state, remainingAnnounce)}
            </View>
          )}
        </>
      )}

      {children}

      {!hideInlineFacts && facts.length > 0 ? (
        <View>
          <Pressable accessibilityRole="button" onPress={() => setFactsOpen((open) => !open)} className="min-h-14 justify-center rounded-[10px] border border-line bg-surface px-4 py-3 shadow-sm">
            <Text className="text-sm font-extrabold text-text">Request details</Text>
            <Text className="text-xs font-medium text-text-secondary">Address, timing and budget</Text>
          </Pressable>
          {factsOpen ? (
            <View className="mt-2 overflow-hidden rounded-[10px] border border-line bg-surface">
              {facts.map((fact) => (
                <View key={fact.label} className="border-b border-line px-4 py-3">
                  <Text className="text-[0.6875rem] font-bold uppercase text-text-muted">{fact.label}</Text>
                  <Text className="mt-0.5 text-sm font-bold text-text">{fact.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {railRecords}
      {attachments}

      <View className="rounded-[10px] border border-line bg-surface px-5 py-4 shadow-sm">
        <Text className="text-base font-bold text-text">What has happened</Text>
        <View className="mt-3">
          <RequestTimeline events={shownEvents} isPending={isTimelinePending} error={timelineError} onRetry={onRetryTimeline} />
        </View>
        {events.length > TIMELINE_PREVIEW ? (
          <Button variant="ghost" onPress={() => setShowAllEvents((open) => !open)}>
            {showAllEvents ? "Show less" : `Show ${hiddenCount} earlier update${hiddenCount === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </View>
    </ScrollView>
  );
}

function headlineForRequest(request: RequestRowView, state: ReturnType<typeof requestState>, fallback: string): string {
  if (state !== "QUOTES_READY" && state !== "UNLOCKED") return fallback;
  if (request.teaserCount <= 0) return fallback;
  const count = request.teaserCount === 1 ? "One professional has" : `${request.teaserCount} professionals have`;
  return `${count} quoted for this job.`;
}

function buildReadout(
  request: RequestRowView | null,
  state: ReturnType<typeof requestState> | null,
  remainingAnnounce: string | null,
) {
  if (request === null || state === null) return null;
  if (showsQuoteDeadline(state) && remainingAnnounce !== null) {
    return (
      <Readout
        label="Quotes promised in"
        value={remainingAnnounce.replace(/ left$/, "")}
        announce={remainingAnnounce}
        tone="active"
      />
    );
  }
  if (request.teaserCount > 0) {
    return (
      <Readout
        label={request.teaserCount === 1 ? "Quote waiting" : "Quotes waiting"}
        value={String(request.teaserCount)}
        tone="active"
      />
    );
  }
  return null;
}

function RequestHeaderError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const presentation = describeError(error, "read");
  const retryable = categorizeError(error) !== "forbidden";
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      actionLabel={retryable ? (presentation.action?.label ?? "Try again") : undefined}
      onAction={retryable ? onRetry : undefined}
      reference={presentation.reference}
    />
  );
}

const EVENT_COPY: Record<string, { title: string; tone: "neutral" | "active" | "success" | "warning" | "danger" }> = {
  REQUIREMENT_SUBMITTED: { title: "You sent this request", tone: "active" },
  REQUIREMENT_EDITED: { title: "You changed this request", tone: "neutral" },
  MATCHING_WAVE_SENT: { title: "We invited professionals", tone: "neutral" },
  QUESTION_ASKED: { title: "A professional asked a question", tone: "warning" },
  QUESTION_ANSWERED: { title: "You answered", tone: "neutral" },
  SITE_VISIT_REQUESTED: { title: "A site visit was requested", tone: "neutral" },
  SITE_VISIT_SCHEDULED: { title: "A site visit was scheduled", tone: "success" },
  QUOTE_RECEIVED: { title: "A quote arrived", tone: "success" },
  SLA_BREACHED: { title: "We missed our quote deadline", tone: "danger" },
  REQUIREMENT_CLOSED: { title: "This request was closed", tone: "neutral" },
};

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function detailLine(event: TimelineEventView): string | null {
  if (event.type === "MATCHING_WAVE_SENT" && typeof event.detail.vendors_invited === "number") {
    const invited = event.detail.vendors_invited;
    return invited === 1 ? "1 professional invited" : `${invited} professionals invited`;
  }
  if ((event.type === "QUESTION_ASKED" || event.type === "QUESTION_ANSWERED") && typeof event.detail.body === "string") {
    return event.detail.body.length > 0 ? event.detail.body : null;
  }
  if (event.type === "SITE_VISIT_SCHEDULED" && typeof event.detail.scheduled_for === "string") {
    return `For ${formatAt(event.detail.scheduled_for)}`;
  }
  return null;
}

function RequestTimeline({
  events,
  isPending,
  error,
  onRetry,
}: {
  events: readonly TimelineEventView[];
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (isPending) {
    return (
      <View className="gap-3">
        <Text className="sr-only">Loading what has happened</Text>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </View>
    );
  }
  if (error !== null && error !== undefined && events.length === 0) {
    const presentation = describeError(error, "read");
    const retryable = categorizeError(error) !== "forbidden";
    return (
      <ErrorState
        title={presentation.title}
        message={presentation.message}
        severity={presentation.severity}
        actionLabel={retryable ? (presentation.action?.label ?? "Try again") : undefined}
        onAction={retryable ? onRetry : undefined}
        reference={presentation.reference}
        inline
      />
    );
  }
  if (events.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        description="Everything we do with this request is recorded here, as it happens."
        compact
      />
    );
  }
  return (
    <View>
      {error !== null && error !== undefined ? (
        <ErrorState
          title="This may not be up to date"
          message={describeError(error, "read").message}
          severity="warning"
          actionLabel="Try again"
          onAction={onRetry}
          inline
        />
      ) : null}
      <Timeline label="What has happened with this request">
        {events.map((event) => {
          const copy = event.type === null ? { title: "Update", tone: "neutral" as const } : (EVENT_COPY[event.type] ?? { title: "Update", tone: "neutral" as const });
          return (
            <TimelineEvent key={event.id} title={copy.title} tone={copy.tone} timestamp={formatAt(event.at)}>
              {detailLine(event)}
            </TimelineEvent>
          );
        })}
      </Timeline>
    </View>
  );
}
