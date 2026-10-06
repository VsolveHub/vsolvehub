// Ported from frontend/apps/partner/features/proposal/view/proposal-status.tsx
import { describeError } from "@vsolve/query/native";
import { Badge, Button, Card, ConfirmAction, Dialog, Disclosure, ErrorState, FactList, Text, Textarea, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import type { EnquiryStatus } from "@/features/enquiry/model/enquiry-state";
import { commercialEstimateFromProposal } from "../model/commercial-estimate-draft";
import {
  UNREADABLE_PROPOSAL_NOTICE,
  describeProposalStatus,
  describeUsability,
  permissionsFor,
  resolveProposalView,
  revalidationNoticeFor,
  traceForInvitation,
  type Proposal,
} from "../model/proposal-state";
import { useDeclineRevisionRequest, useMyProposals, useWithdrawProposal } from "../queries";
import { EstimatePreviewSheet } from "./estimate-preview-sheet";
import { OverallDiscountDialog } from "./overall-discount-dialog";

const TONE = { progress: "info", settled: "neutral", gone: "neutral", won: "success" } as const;

function timeAgo(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export interface ProposalStatusProps {
  readonly enquiryStatus: EnquiryStatus;
  readonly invitationId: string;
  readonly requirementId: string;
  readonly submitted: Proposal | null;
  readonly onRevise: () => void;
  readonly documentKind?: "quote" | "estimate";
}

export function ProposalStatus({ enquiryStatus, invitationId, requirementId, submitted, onRevise, documentKind = "quote" }: ProposalStatusProps) {
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [viewingEstimate, setViewingEstimate] = useState(false);
  const withdraw = useWithdrawProposal();
  const shouldRead = enquiryStatus === "QUOTED" || enquiryStatus === "ACCEPTED";
  const mine = useMyProposals(requirementId, shouldRead);
  const trace = traceForInvitation({ proposals: mine.data?.results ?? [], invitationId });
  const record = submitted !== null && (trace.current === null || submitted.revision >= trace.current.revision) ? submitted : trace.current;
  const view = resolveProposalView({ enquiryStatus, proposal: record });
  const documentLabel = documentKind === "estimate" ? "estimate" : "quote";
  const documentCopy = (copy: string) => (documentKind === "estimate" ? copy.replaceAll("quotes", "estimates").replaceAll("quote", "estimate") : copy);

  if (view.kind === "none") return null;

  if (view.kind === "unreadable") {
    return (
      <Card className="flex-col gap-3 p-4">
        <Text className="text-sm font-semibold text-text">Your {documentLabel}</Text>
        {mine.isPending ? (
          <Text className="text-sm leading-6 text-text-secondary">Loading the {documentLabel} you sent…</Text>
        ) : (
          <>
            <Text className="text-sm leading-6 text-text-secondary">{documentCopy(UNREADABLE_PROPOSAL_NOTICE)}</Text>
            <View className="flex-row flex-wrap gap-2">
              <Button variant="outline" onPress={() => void mine.refetch()} loading={mine.isFetching} loadingLabel="Loading">Try again</Button>
              {documentKind === "quote" ? <Button variant="ghost" onPress={onRevise}>Send a new quote</Button> : null}
            </View>
          </>
        )}
      </Card>
    );
  }

  const current = view.proposal;
  const status = describeProposalStatus(current.status);
  const usability = describeUsability(current.usability);
  const revalidation = revalidationNoticeFor(current);
  const permissions = permissionsFor({ proposal: current, enquiryStatus, documentKind });
  const presentation = withdraw.error ? describeError(withdraw.error, "mutation") : null;
  const submittedDraft = commercialEstimateFromProposal(current);

  return (
    <Card className="flex-col gap-4 p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-sm font-semibold text-text">
          Your {documentLabel}
          {current.revision > 1 ? <Text className="font-normal text-text-secondary"> revision {current.revision}</Text> : null}
        </Text>
        <Badge tone={TONE[status.tone]} dot>{status.label}</Badge>
      </View>
      <Text className="text-sm leading-6 text-text-secondary">{documentCopy(status.meaning)}</Text>
      {current.discount_paise > 0 ? <AppliedDiscountSummary proposal={current} /> : null}
      <FactList
        items={[
          ...(current.discount_paise > 0 ? [] : [{ label: "Total", value: formatMoney(current.total_paise) }]),
          { label: "Tax", value: current.tax_basis === "INCLUSIVE" ? "Included in the total" : `${formatMoney(current.tax_paise)} on top` },
          ...(current.rate_paise_per_worker_day !== null ? [{ label: "Rate", value: `${formatMoney(current.rate_paise_per_worker_day)} per worker per day` }] : []),
          ...(current.minimum_days !== null ? [{ label: "Minimum", value: `${current.minimum_days} days` }] : []),
          ...(current.worker_count !== null ? [{ label: "Workers", value: String(current.worker_count) }] : []),
          ...(current.stages.length > 0 ? [{ label: "Broken into", value: `${current.stages.length} ${current.stages.length === 1 ? "part" : "parts"}` }] : []),
          ...(current.material_lines.length > 0 ? [{ label: "Materials", value: `${current.material_lines.length} ${current.material_lines.length === 1 ? "line" : "lines"}` }] : []),
          ...(current.site_visit !== null ? [{ label: "Written", value: "On site, after your visit" }] : []),
          ...(current.valid_until !== null ? [{ label: "Valid until", value: timeAgo(current.valid_until) }] : []),
          { label: "Sent", value: timeAgo(current.submitted_at) },
        ]}
      />
      {current.revision_request !== null ? (
        <RevisionRequestPanel proposal={current} requirementId={requirementId} documentLabel={documentLabel} onRevise={onRevise} />
      ) : null}
      {current.stages.length > 0 ? <StageBreakdown stages={current.stages} /> : null}
      {current.material_lines.length > 0 ? <MaterialBreakdown lines={current.material_lines} /> : null}
      {usability ? <Text className="text-sm leading-6 text-warning-text">{usability}</Text> : null}
      {revalidation ? <Text className="text-sm leading-6 text-warning-text">{revalidation}</Text> : null}
      {current.vendor_confirmed_at === null ? (
        <Text className="text-sm leading-6 text-warning-text">
          Vsolve recorded this {documentLabel} on your behalf and it has not been confirmed by you, so the customer cannot see it yet. Support will confirm it with you directly.
        </Text>
      ) : null}
      {presentation ? <ErrorState inline title={presentation.title} message={presentation.message} severity={presentation.severity} reference={presentation.reference} /> : null}
      <View className="flex-col gap-2">
        <Button onPress={() => setViewingEstimate(true)} disabled={withdraw.isPending}>View {documentLabel} details</Button>
        {permissions.canSupersede ? <Button variant="outline" onPress={onRevise} disabled={withdraw.isPending}>Revise {documentLabel}</Button> : null}
        {permissions.canWithdraw ? (
          <View className="border-t border-line pt-2">
            <Button variant="ghost" onPress={() => setConfirmingWithdraw(true)} disabled={withdraw.isPending} loading={withdraw.isPending} loadingLabel="Withdrawing" className="text-danger-text">Withdraw {documentLabel}</Button>
          </View>
        ) : null}
      </View>
      {trace.superseded.length > 0 ? <SupersessionTrace rows={trace.superseded} documentLabel={documentLabel} /> : null}
      <ConfirmAction
        open={confirmingWithdraw}
        onOpenChange={setConfirmingWithdraw}
        title={`Withdraw this ${documentLabel}`}
        consequence={`The customer can no longer choose this ${documentLabel}. Your enquiry stays open, so you can send a new one — but this price is off the table as soon as you confirm, and withdrawing cannot be undone.`}
        confirmLabel="Withdraw"
        destructive
        pending={withdraw.isPending}
        onConfirm={() => withdraw.mutate({ proposalId: current.id, requirementId }, { onSuccess: () => setConfirmingWithdraw(false) })}
      />
      <EstimatePreviewSheet
        open={viewingEstimate}
        onClose={() => setViewingEstimate(false)}
        draft={submittedDraft}
        preview={current}
        vendorName={`${documentKind === "estimate" ? "Estimate" : "Quote"} revision ${current.revision}`}
        materialList={submittedDraft.materialAdded}
        partnerTurnkey={current.material_fulfilment_mode === "PARTNER_TURNKEY"}
        title={`Your submitted ${documentLabel}`}
        description={`Revision ${current.revision} · this is the detail currently with the customer.`}
        closeLabel="Close"
      />
    </Card>
  );
}

const REVISION_REASON: Record<string, string> = {
  LEAVE_OUT: "Leave something out",
  CHANGE_MATERIALS: "Change materials or finish",
  PHASE_WORK: "Split the work into phases",
  PRICE: "Asked about the price",
  OTHER: "Something else",
};

function AppliedDiscountSummary({ proposal }: { readonly proposal: Proposal }) {
  const percentLabel = proposal.discount_bps === null ? null : `${proposal.discount_bps / 100}% off`;
  return (
    <View className="rounded-card border border-success-line bg-success-surface p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-2xl font-extrabold text-text">{formatMoney(proposal.total_paise)}</Text>
        {percentLabel ? <Badge tone="success">{percentLabel}</Badge> : null}
      </View>
      <View className="mt-3 gap-1.5">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-sm text-text-secondary">Original estimate</Text>
          <Text className="text-sm text-text-secondary line-through">{formatMoney(proposal.discount_base_paise)}</Text>
        </View>
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-sm text-text-secondary">Overall discount</Text>
          <Text className="text-sm font-bold text-success-text">−{formatMoney(proposal.discount_paise)}</Text>
        </View>
        <View className="flex-row items-baseline justify-between gap-3 border-t border-success-line pt-2">
          <Text className="text-sm font-extrabold text-text">Final customer total</Text>
          <Text className="text-sm font-extrabold text-text">{formatMoney(proposal.total_paise)}</Text>
        </View>
      </View>
      <Text className="mt-2 text-xs leading-5 text-success-text">The overall discount is applied. Scope, warranty and line-item rates are unchanged.</Text>
    </View>
  );
}

function RevisionRequestPanel({ proposal, requirementId, documentLabel, onRevise }: { readonly proposal: Proposal; readonly requirementId: string; readonly documentLabel: "quote" | "estimate"; readonly onRevise: () => void }) {
  const request = proposal.revision_request;
  const decline = useDeclineRevisionRequest();
  const excludedItems: readonly string[] = Array.isArray(request?.excluded_items)
    ? request.excluded_items.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [discounting, setDiscounting] = useState(false);
  const [discountMode, setDiscountMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  if (request === null) return null;
  const isOpen = request.status === "OPEN";
  const presentation = decline.error ? describeError(decline.error, "mutation") : null;
  const askedBps = request.requested_discount_bps ?? null;
  const askedSavingPaise = askedBps === null ? 0 : Math.round((proposal.total_paise * askedBps) / 10_000);

  if (isOpen && askedBps !== null) {
    return (
      <>
        <View className="rounded-card border border-line bg-surface-sunken p-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-sm font-extrabold text-text">Price</Text>
            <Badge tone="neutral">Requested · not applied</Badge>
          </View>
          <View className="mt-3 gap-1.5">
            <View className="flex-row items-baseline justify-between gap-3"><Text className="text-sm text-text-secondary">Current estimate</Text><Text className="text-sm font-bold text-text">{formatMoney(proposal.total_paise)}</Text></View>
            <View className="flex-row items-baseline justify-between gap-3"><Text className="text-sm text-text-secondary">Customer requested</Text><Text className="text-sm font-bold text-text">{askedBps / 100}% overall</Text></View>
            <View className="flex-row items-baseline justify-between gap-3"><Text className="text-sm text-text-secondary">Overall discount</Text><Text className="text-sm font-bold text-success-text">−{formatMoney(askedSavingPaise)}</Text></View>
            <View className="flex-row items-baseline justify-between gap-3 border-t border-line pt-2"><Text className="text-sm font-extrabold text-text">New total if applied</Text><Text className="text-lg font-extrabold text-text">{formatMoney(proposal.total_paise - askedSavingPaise)}</Text></View>
          </View>
          <Text className="mt-2 text-xs text-text-muted">Requested {timeAgo(request.created_at)} · the current price remains live until you confirm.</Text>
          {request.note.trim() !== "" ? <Text className="mt-2 text-sm leading-6 text-text-secondary">“{request.note.trim()}”</Text> : null}
          {presentation ? <ErrorState inline className="mt-3" title={presentation.title} message={presentation.message} severity={presentation.severity} /> : null}
          <View className="mt-4 flex-row flex-wrap gap-2">
            <Button size="sm" onPress={() => { setDiscountMode("PERCENT"); setDiscounting(true); }}>Apply {askedBps / 100}% discount</Button>
            <Button size="sm" variant="outline" onPress={() => { setDiscountMode("FIXED"); setDiscounting(true); }}>Set another discount</Button>
            <Button size="sm" variant="ghost" onPress={() => setDeclining(true)}>Keep current price</Button>
          </View>
          <Text className="mt-2 text-xs leading-5 text-text-muted">Scope, warranty and line-item rates remain unchanged.</Text>
        </View>
        <Dialog
          open={declining}
          onOpenChange={setDeclining}
          title="Keep the current price?"
          description={`Your ${documentLabel} stays exactly as sent. The customer reads your note beside their request.`}
          footer={
            <>
              <Button variant="ghost" onPress={() => setDeclining(false)}>Back</Button>
              <Button variant="danger" loading={decline.isPending} loadingLabel="Keeping current price" onPress={() => decline.mutate({ proposalId: proposal.id, requestId: request.id, requirementId, note: note.trim() }, { onSuccess: () => setDeclining(false) })}>Keep current price</Button>
            </>
          }
        >
          <Textarea maxLength={1000} value={note} onChangeText={setNote} placeholder="Material and labour costs are already at the lowest workable amount." />
        </Dialog>
        <OverallDiscountDialog open={discounting} onClose={() => setDiscounting(false)} proposal={proposal} requestId={request.id} requestedBps={askedBps} requirementId={requirementId} initialMode={discountMode} />
      </>
    );
  }

  return (
    <View className={isOpen ? "rounded-control border border-info-line bg-info-surface p-3" : "rounded-control border border-line bg-surface-sunken p-3"}>
      <Text className="text-sm font-semibold text-text">
        {isOpen ? (askedBps === null ? `The customer asked for a revised ${documentLabel}` : "A customer asked about your price") : request.status === "ANSWERED" ? "You answered their revision request" : "You declined their revision request"}
      </Text>
      {askedBps !== null ? (
        <View className="mt-2 gap-1 rounded-control bg-surface px-3 py-2">
          <View className="flex-row items-baseline justify-between gap-3"><Text className="text-sm text-text-secondary">You quoted</Text><Text className="text-sm font-bold text-text">{formatMoney(proposal.total_paise)}</Text></View>
          <View className="flex-row items-baseline justify-between gap-3"><Text className="text-sm text-text-secondary">They asked for</Text><Text className="text-sm font-extrabold text-text">{formatMoney(proposal.total_paise - askedSavingPaise)} ({askedBps / 100}% off)</Text></View>
          <View className="flex-row items-baseline justify-between gap-3 border-t border-line pt-1"><Text className="text-sm text-text-secondary">You would lose</Text><Text className="text-sm font-bold text-warning-text">{formatMoney(askedSavingPaise)}</Text></View>
        </View>
      ) : null}
      <Text className="mt-1 text-sm leading-6 text-text-secondary">
        {REVISION_REASON[request.reason_code] ?? request.reason_code}
        {excludedItems.length > 0 ? `: ${excludedItems.join(", ")}` : ""}
        {request.note.trim() !== "" ? ` — “${request.note.trim()}”` : ""}
      </Text>
      <Text className="mt-0.5 text-xs text-text-muted">Asked {timeAgo(request.created_at)}</Text>
      {request.decline_note.trim() !== "" ? <Text className="mt-1 text-sm text-text">Your note: “{request.decline_note.trim()}”</Text> : null}
      {presentation ? <ErrorState inline className="mt-2" title={presentation.title} message={presentation.message} severity={presentation.severity} /> : null}
      {isOpen ? (
        <>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <Button size="sm" onPress={onRevise}>{askedBps === null ? `Send a revised ${documentLabel}` : `Agree — re-issue at ${formatMoney(proposal.total_paise - askedSavingPaise)}`}</Button>
            {askedBps === null ? null : <Button size="sm" variant="outline" onPress={onRevise}>Offer a different figure</Button>}
            <Button size="sm" variant="ghost" onPress={() => setDeclining(true)}>{askedBps === null ? "Decline with a note" : "Cannot move — say why"}</Button>
          </View>
          <Text className="mt-2 text-xs leading-5 text-text-muted">Your {documentLabel} stays live either way. They can still accept it at {formatMoney(proposal.total_paise)} while you decide.</Text>
        </>
      ) : null}
      <Dialog
        open={declining}
        onOpenChange={setDeclining}
        title="Decline the change?"
        description={`Your ${documentLabel} stays exactly as sent. Tell the customer why — they read it beside their request.`}
        footer={
          <>
            <Button variant="ghost" onPress={() => setDeclining(false)}>Keep thinking</Button>
            <Button variant="danger" loading={decline.isPending} loadingLabel="Declining" onPress={() => decline.mutate({ proposalId: proposal.id, requestId: request.id, requirementId, note: note.trim() }, { onSuccess: () => setDeclining(false) })}>Decline</Button>
          </>
        }
      >
        <Textarea maxLength={1000} value={note} onChangeText={setNote} placeholder="The false ceiling carries the lights, so it cannot come out on its own." />
      </Dialog>
    </View>
  );
}

function StageBreakdown({ stages }: { readonly stages: Proposal["stages"] }) {
  return (
    <View className="flex-col gap-2">
      {stages.map((stage, index) => (
        <View key={`${stage.title}-${index}`} className="flex-row items-start justify-between gap-3 rounded-control border border-line p-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-text">{stage.title.trim() === "" ? `Part ${index + 1}` : stage.title}</Text>
            {stage.deliverable ? <Text className="mt-0.5 text-sm leading-6 text-text-secondary">{stage.deliverable}</Text> : null}
            {stage.ends_on ? <Text className="mt-0.5 text-xs text-text-muted">Done by {stage.ends_on}</Text> : null}
          </View>
          <Text className="text-sm font-semibold text-text">{formatMoney(stage.discounted_amount_paise)}</Text>
        </View>
      ))}
    </View>
  );
}

function MaterialBreakdown({ lines }: { readonly lines: Proposal["material_lines"] }) {
  return (
    <View className="flex-col gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Materials (paid as an advance)</Text>
      {lines.map((line, index) => {
        const measure = [Number(line.quantity) > 1 ? line.quantity.replace(/\.0+$/u, "") : null, line.unit.trim() === "" ? null : line.unit.trim()].filter((part): part is string => part !== null).join(" ");
        return (
          <View key={`${line.title}-${index}`} className="flex-row items-start justify-between gap-3 rounded-control border border-line p-3">
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-text">{line.title.trim() === "" ? `Material ${index + 1}` : line.title}</Text>
              {measure === "" ? null : <Text className="mt-0.5 text-xs text-text-muted">{measure}</Text>}
            </View>
            <Text className="text-sm font-semibold text-text">{line.amount_paise === undefined ? "—" : formatMoney(line.amount_paise)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SupersessionTrace({ rows, documentLabel }: { readonly rows: readonly Proposal[]; readonly documentLabel: "quote" | "estimate" }) {
  return (
    <Disclosure summary={`Earlier versions (${rows.length})`}>
      <View className="mt-2 flex-col gap-2">
        {rows.map((row) => {
          const status = describeProposalStatus(row.status);
          return (
            <View key={row.id} className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="text-sm text-text-secondary">Revision {row.revision} · {formatMoney(row.total_paise)} · sent {timeAgo(row.submitted_at)}</Text>
              <Badge tone={TONE[status.tone]}>{status.label}</Badge>
            </View>
          );
        })}
      </View>
      <Text className="mt-2 text-xs leading-5 text-text-muted">
        Vsolve never overwrites {documentLabel === "estimate" ? "an" : "a"} {documentLabel}. The customer can still see each version, and none can be chosen after it has been replaced.
      </Text>
    </Disclosure>
  );
}
