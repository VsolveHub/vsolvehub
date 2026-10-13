// Ported from frontend/apps/customer/features/payment/view/receipt.tsx
import { describeError } from "@vsolve/query/native";
import { Badge, Button, ErrorState, Logo, Skeleton, Text } from "@vsolve/mobile-ui";
import { apiBaseUrl, getApiClient } from "@vsolve/mobile-core";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";

import { useBookingGroup } from "@/features/bookings/queries";
import { Money } from "@/features/payment/view/money";
import { useOrder, type Order, type TaxDocument } from "@/features/payment/queries";

const DOCUMENT_LABELS: Record<TaxDocument["kind"], string> = {
  INVOICE: "Invoice",
  CREDIT_NOTE: "Credit note",
};

const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  CONFIRMED: "Paid",
  CANCELLED: "Cancelled",
  REFUNDING: "Refund in progress",
  REFUNDED: "Refunded",
};

function TaxDocumentCard({ document }: { document: TaxDocument }) {
  return (
    <View className="rounded-lg border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between gap-2 border-b border-line pb-2">
        <Text className="min-w-0 flex-1 text-xs font-semibold text-text">
          {DOCUMENT_LABELS[document.kind]}{" "}
          <Text className="font-mono text-xs text-text-secondary">{document.number}</Text>
        </Text>
        {document.is_test ? <Badge tone="warning">Test document</Badge> : null}
      </View>
      {document.issued_at !== null ? (
        <Text className="mt-1 text-xs text-text-secondary">
          Issued{" "}
          {new Date(document.issued_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
      ) : null}
      <View className="mt-2 gap-1">
        {document.lines.map((line) => (
          <View key={line.id} className="flex-row items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-xs text-text">
              {line.label} {line.quantity > 1 ? `× ${line.quantity}` : ""}
            </Text>
            <Money value={line.total} className="shrink-0 text-xs tabular-nums text-text-secondary" />
          </View>
        ))}
      </View>
      <View className="mt-2 flex-row justify-between gap-3 border-t border-line pt-2">
        <Text className="text-xs font-semibold text-text">Document Total</Text>
        <Money value={document.total} className="shrink-0 text-xs font-semibold tabular-nums text-text" />
      </View>
    </View>
  );
}

function DownloadInvoiceButton({ document }: { document: TaxDocument }) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function download() {
    setState("working");
    try {
      const url = `${apiBaseUrl()}/api/v1/tax-documents/${document.id}/download/`;
      await getApiClient().GET("/api/v1/tax-documents/{document_id}/", {
        params: { path: { document_id: document.id } },
      });
      await Share.share({ message: url, title: `invoice-${document.number}.pdf` });
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <View className="min-w-0">
      <Button
        variant="primary"
        onPress={() => void download()}
        loading={state === "working"}
        loadingLabel="Preparing PDF"
        className="h-11 max-w-full px-3"
      >
        Download invoice PDF
      </Button>
      {state === "failed" ? (
        <Text className="mt-1 text-xs text-danger-text" accessibilityRole="alert">
          The PDF could not be downloaded. Try again.
        </Text>
      ) : null}
    </View>
  );
}

export function GroupReceipt({ groupId }: { groupId: string }) {
  const groupQuery = useBookingGroup(groupId);
  const group = groupQuery.data;
  const orderId = group?.order_id ?? null;
  const orderQuery = useOrder(orderId);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([groupQuery.refetch(), orderQuery.refetch()]);
    setRefreshing(false);
  };

  if (groupQuery.isPending) {
    return (
      <View className="gap-4 px-4 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </View>
    );
  }

  if (group == null) {
    return (
      <ErrorState
        severity="warning"
        title="We could not open this booking"
        message={
          groupQuery.isError ? describeError(groupQuery.error, "read").message : "This booking could not be found."
        }
      />
    );
  }

  if (orderId === null) {
    return (
      <ErrorState
        severity="info"
        title="There is no receipt yet"
        message="A receipt appears once your payment is confirmed. You have not been charged."
      />
    );
  }

  if (orderQuery.isPending) return <Skeleton className="mx-4 mt-6 h-96 w-full rounded-xl" />;

  if (orderQuery.data == null) {
    return (
      <ErrorState
        severity="warning"
        title="We could not show your receipt"
        message={
          orderQuery.isError ? describeError(orderQuery.error, "read").message : "This receipt could not be loaded."
        }
        actionLabel="Try again"
        onAction={() => void orderQuery.refetch()}
      />
    );
  }

  const order = orderQuery.data;
  const lines = group.units.flatMap((unit) => unit.lines);
  const invoice = order.tax_documents.find((document) => document.kind === "INVOICE") ?? null;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-4 py-6"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="gap-3">
        <Link href={`/bookings/${group.id}`} asChild>
          <Pressable className="min-h-11 justify-center">
            <Text className="text-sm font-semibold text-text-link">← Back to booking</Text>
          </Pressable>
        </Link>
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>{ORDER_STATUS_LABELS[order.status]}</Badge>
          {invoice === null ? null : <DownloadInvoiceButton document={invoice} />}
          <Button
            variant="outline"
            className="h-11 shrink-0 px-3"
            onPress={() =>
              void Share.share({
                message: `Payment receipt for booking ${group.id}`,
              })
            }
          >
            Share
          </Button>
        </View>
      </View>

      <View className="gap-8 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <View className="gap-6 border-b border-line pb-6">
          <View className="min-w-0">
            <Logo className="h-8 w-auto max-w-full" />
            <View className="mt-3 gap-0.5">
              <Text className="text-xs font-semibold text-text">Vsolve Hub Services India Pvt. Ltd.</Text>
              <Text className="text-xs text-text-secondary">Home services and project marketplace</Text>
              <Text className="text-xs text-text-secondary">
                Plot 12, Hitech City Road, Madhapur, Hyderabad, Telangana 500081
              </Text>
              <Text className="text-xs text-text-secondary">Support: support@vsolvehub.com | www.vsolvehub.com</Text>
            </View>
          </View>
          <View className="min-w-0 gap-1">
            <Text className="text-xl font-bold uppercase tracking-tight text-text">Payment Receipt & Invoice</Text>
            <Text className="text-xs text-text-secondary">
              Tax Invoice for Booking Reference{" "}
              <Text className="font-mono text-xs font-medium text-text">{group.id}</Text>
            </Text>
            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <Badge tone={order.status === "CONFIRMED" ? "success" : "neutral"}>
                {ORDER_STATUS_LABELS[order.status]}
              </Badge>
              <Text className="font-mono text-xs text-text-secondary">Order Ref: {order.id}</Text>
            </View>
          </View>
        </View>

        <View className="gap-6 rounded-lg border border-line bg-surface-sunken p-4">
          <View>
            <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-text-secondary">
              Customer & Billing Details
            </Text>
            <Text className="text-sm font-semibold text-text">Service Account Holder</Text>
            <Text className="mt-1 text-xs text-text-secondary">
              Order Reference: <Text className="font-mono text-xs text-text-secondary">{order.id}</Text>
            </Text>
            <Text className="text-xs text-text-secondary">
              Booking Reference: <Text className="font-mono text-xs text-text-secondary">{group.id}</Text>
            </Text>
          </View>
          <View>
            <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-text-secondary">
              Fulfillment Summary
            </Text>
            <Text className="text-xs text-text-secondary">
              Booked Date:{" "}
              <Text className="text-xs font-medium text-text">
                {new Date(group.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </Text>
            </Text>
            <Text className="mt-1 text-xs text-text-secondary">
              Visits Scheduled:{" "}
              <Text className="text-xs font-medium text-text">
                {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
              </Text>
            </Text>
          </View>
        </View>

        <View>
          <View className="flex-row border-b border-line-strong bg-surface-sunken">
            <Text className="w-[10%] px-1 py-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">#</Text>
            <Text className="w-[50%] px-1 py-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Service / Description
            </Text>
            <Text className="w-[15%] px-1 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Qty
            </Text>
            <Text className="w-[25%] px-1 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Amount
            </Text>
          </View>
          {lines.map((line, index) => (
            <View key={line.id} className="flex-row border-b border-line">
              <Text className="w-[10%] px-1 py-3 font-mono text-xs text-text-secondary">{index + 1}</Text>
              <Text className="w-[50%] px-1 py-3 text-sm font-medium text-text">{line.label}</Text>
              <Text className="w-[15%] px-1 py-3 text-center text-sm text-text-secondary">{line.quantity}</Text>
              <Money value={line.amount} className="w-[25%] px-1 py-3 text-right font-mono text-sm tabular-nums text-text" />
            </View>
          ))}
        </View>

        <View className="gap-6 border-t border-line pt-6">
          {order.tax_documents.length > 0 ? (
            <View>
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-text-secondary">Tax Documents</Text>
              <View className="gap-2">
                {order.tax_documents.map((document) => (
                  <TaxDocumentCard key={document.id} document={document} />
                ))}
              </View>
            </View>
          ) : null}
          <View className="gap-3 rounded-lg border border-line bg-surface-sunken p-4">
            <View className="flex-row justify-between gap-3">
              <Text className="text-sm text-text-secondary">Subtotal</Text>
              <Money value={order.total} className="shrink-0 font-mono text-sm tabular-nums text-text" />
            </View>
            <View className="flex-row justify-between gap-3">
              <Text className="text-xs text-text-secondary">Applicable Taxes & GST</Text>
              <Text className="shrink-0 text-xs text-text-secondary">Included</Text>
            </View>
            <View className="flex-row items-baseline justify-between gap-3 border-t border-line pt-3">
              <Text className="text-base font-bold text-text">Total Paid</Text>
              <Money value={order.total} className="shrink-0 text-2xl font-bold tabular-nums text-text" />
            </View>
          </View>
        </View>

        <View className="gap-1 border-t border-line pt-6">
          <Text className="text-center text-xs font-medium text-text">
            This is an official computer-generated tax invoice issued by Vsolve Hub Services India Pvt. Ltd.
          </Text>
          <Text className="text-center text-xs text-text-secondary">
            Thank you for choosing Vsolve Hub for your home service needs!
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
