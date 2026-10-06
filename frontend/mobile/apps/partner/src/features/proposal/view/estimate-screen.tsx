// Ported from frontend/apps/partner/features/proposal/view/onsite-screen.tsx
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Input, Spinner, Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { planVisitOf, readEnquiryRecord } from "@/features/enquiry/model/wire";
import { isEnquiryForbidden, usePartnerEnquiry } from "@/features/enquiry/queries";
import {
  EMPTY_ONSITE_DRAFT,
  toOnsiteRequest,
  type OnsiteDraft,
} from "@/features/proposal/model/onsite-draft";
import type { TaxBasis } from "@/features/proposal/model/proposal-draft";
import { CommercialEstimateComposer, clearSavedCommercialEstimate } from "@/features/proposal/view/commercial-estimate-composer";
import type { ProposalRequest } from "@/features/proposal/model/commercial-estimate-draft";
import { useMyProposals, useSubmitProposal } from "@/features/proposal/queries";
import { visitPermissionsFor } from "@/features/visit/model/visit-state";

export function EstimateScreen({ invitationId }: { invitationId: string }) {
  const enquiry = usePartnerEnquiry(invitationId);
  if (enquiry.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-canvas">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading this estimate…</Text>
      </View>
    );
  }
  if (enquiry.isError || enquiry.data === undefined) {
    const forbidden = isEnquiryForbidden(enquiry.error);
    return (
      <ErrorState
        title={forbidden ? "This enquiry is not yours" : "We could not load this estimate"}
        message="Check your connection and try again."
        actionLabel={forbidden ? undefined : "Try again"}
        onAction={forbidden ? undefined : () => void enquiry.refetch()}
      />
    );
  }
  return <EstimateForm invitationId={invitationId} detail={enquiry.data} />;
}

function EstimateForm({
  invitationId,
  detail,
}: {
  invitationId: string;
  detail: NonNullable<ReturnType<typeof usePartnerEnquiry>["data"]>;
}) {
  const router = useRouter();
  const record = readEnquiryRecord(detail);
  const visit = planVisitOf(record.siteVisits);
  const permissions = visitPermissionsFor(visit);
  const proposals = useMyProposals(record.requirementId);
  const submit = useSubmitProposal();
  const [title, setTitle] = useState(record.serviceName);
  const [days, setDays] = useState("1");
  const [rupees, setRupees] = useState("");
  const [taxBasis, setTaxBasis] = useState<TaxBasis>("INCLUSIVE");
  const [composer, setComposer] = useState<"stage" | "commercial">("commercial");
  const [localError, setLocalError] = useState<string | null>(null);
  const latest = proposals.data?.results?.[0];
  const supersedes = latest?.revision ?? 0;

  function send() {
    if (visit === null) return;
    const amountPaise = Math.round(Number(rupees) * 100);
    const workingDays = Number(days);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0 || !Number.isFinite(workingDays) || workingDays <= 0) {
      setLocalError("Enter the days and the amount.");
      return;
    }
    const draft: OnsiteDraft = {
      ...EMPTY_ONSITE_DRAFT,
      startsOn: record.requestedStart,
      taxBasis,
      stages: [{ title: title.trim() || record.serviceName, deliverable: title.trim() || record.serviceName, workingDays, amountPaise }],
    };
    try {
      submit.mutate(
        {
          invitationId,
          requirementId: record.requirementId,
          supersedesRevision: supersedes,
          body: toOnsiteRequest({ invitationId, siteVisitId: visit.id, draft }),
        },
        { onSuccess: () => router.replace(`/work/enquiries/${invitationId}` as never) },
      );
      setLocalError(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "This estimate is not ready to send.");
    }
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-3 px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">Estimate</Text>
      {latest ? (
        <Text className="text-sm text-text-secondary">
          Last quote {formatMoney(latest.total_paise)} · revision {latest.revision}
        </Text>
      ) : null}
      {permissions.canEstimate && visit ? (
        <>
          <View className="flex-row gap-2">
            <Pressable onPress={() => setComposer("commercial")} className="min-h-12 flex-1 items-center justify-center rounded-2xl border border-line bg-surface">
              <Text className="text-sm font-semibold text-text">Item and labour</Text>
            </Pressable>
            <Pressable onPress={() => setComposer("stage")} className="min-h-12 flex-1 items-center justify-center rounded-2xl border border-line bg-surface">
              <Text className="text-sm font-semibold text-text">Stage total</Text>
            </Pressable>
          </View>
          {composer === "commercial" ? (
            <CommercialEstimateComposer
              invitationId={invitationId}
              siteVisitId={visit.id}
              serviceName={record.serviceName}
              archetype={record.archetype}
              isSubmitting={submit.isPending}
              onSend={(request: ProposalRequest) => {
                if (submit.isPending) return;
                submit.mutate(
                  { body: request, supersedesRevision: supersedes, requirementId: record.requirementId, invitationId },
                  {
                    onSuccess: () => {
                      clearSavedCommercialEstimate(invitationId);
                      router.replace(`/work/enquiries/${invitationId}` as never);
                    },
                  },
                );
              }}
            />
          ) : null}
          {composer === "stage" ? (
            <>
          <Input value={title} onChangeText={setTitle} placeholder="What the work is" />
          <Input value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="Working days" />
          <Input value={rupees} onChangeText={setRupees} keyboardType="decimal-pad" placeholder="Amount in rupees" />
          <View className="flex-row gap-2">
            {(["INCLUSIVE", "EXCLUSIVE"] as const).map((basis) => (
              <Pressable
                key={basis}
                onPress={() => setTaxBasis(basis)}
                className={
                  taxBasis === basis
                    ? "min-h-12 flex-1 items-center justify-center rounded-2xl border border-selected bg-selected-surface"
                    : "min-h-12 flex-1 items-center justify-center rounded-2xl border border-line bg-surface"
                }
              >
                <Text className="text-sm font-semibold text-text">{basis === "INCLUSIVE" ? "Tax included" : "Tax extra"}</Text>
              </Pressable>
            ))}
          </View>
          {localError ? <Text className="text-sm text-danger-text">{localError}</Text> : null}
          {submit.error ? <Text className="text-sm text-danger-text">{describeError(submit.error, "mutation").message}</Text> : null}
          <Button loading={submit.isPending} loadingLabel="Sending" onPress={send}>
            Send estimate
          </Button>
            </>
          ) : null}
        </>
      ) : (
        <Text className="text-sm text-text-secondary">Finish the visit before sending an estimate.</Text>
      )}
      <Button variant="ghost" onPress={() => router.replace(`/work/enquiries/${invitationId}` as never)}>
        Back to the enquiry
      </Button>
    </ScrollView>
  );
}
