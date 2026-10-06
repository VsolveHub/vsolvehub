// Ported from frontend/apps/customer/features/quotes/view/shopping-list-card.tsx
import { apiBaseUrl } from "@vsolve/mobile-core";
import { Button, Dialog, Text, cn } from "@vsolve/mobile-ui";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Share, View } from "react-native";

import type { QuoteMaterialListRowView } from "../adapters";
import { MaterialListRows, materialListText } from "./material-list-rows";

export function ShoppingListCard({
  requirementId,
  proposalId,
  rows,
  brandTierLabel,
  vendorName,
  serviceName,
  className,
}: {
  requirementId: string;
  proposalId: string;
  rows: readonly QuoteMaterialListRowView[];
  brandTierLabel: string | null;
  vendorName: string | null;
  serviceName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = rows.length;
  if (count === 0) return null;

  const pdfUrl = `${apiBaseUrl()}/api/v1/requirements/${requirementId}/quotes/${proposalId}/shopping-list/download/`;
  const shareText = materialListText({ serviceName, rows, brandTierLabel });

  return (
    <>
      <View className={cn("rounded-[14px] border border-line bg-surface p-4 shadow-sm", className)}>
        <View className="flex-row items-start gap-3">
          <View className="size-11 shrink-0 items-center justify-center rounded-[12px] bg-action-surface">
            <Text className="text-lg text-signal-700">▣</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-text-muted">
              Materials you buy
            </Text>
            <Text className="mt-0.5 text-base font-extrabold leading-tight text-text">What you need to buy</Text>
            <Text className="mt-0.5 text-sm text-text-secondary">
              {count} {count === 1 ? "item" : "items"}
              {brandTierLabel !== null ? ` · ${brandTierLabel}` : ""}
            </Text>
          </View>
        </View>
        <Button variant="primary" className="mt-3 w-full" onPress={() => setOpen(true)}>
          View the list (PDF)
        </Button>
        <Text className="mt-2 text-xs leading-4 text-text-muted">
          Quantities and specs only — not inside the estimate total.
        </Text>
      </View>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="What you need to buy"
        description={vendorName === null ? "Prepared on your estimate." : `Prepared by ${vendorName}.`}
        footer={
          <View className="w-full flex-row flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onPress={() => {
                void Share.share({ title: "What to buy", message: shareText });
              }}
            >
              Share
            </Button>
            <Button
              variant="primary"
              onPress={() => {
                void WebBrowser.openBrowserAsync(pdfUrl);
              }}
            >
              Download
            </Button>
          </View>
        }
      >
        <MaterialListRows rows={rows} />
        <Text className="mt-3 text-xs leading-5 text-text-muted">
          The branded PDF opens in the browser. This list is the same quantities and specs.
        </Text>
      </Dialog>
    </>
  );
}
