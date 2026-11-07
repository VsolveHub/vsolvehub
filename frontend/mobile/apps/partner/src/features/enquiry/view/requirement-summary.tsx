// Ported from frontend/apps/partner/features/enquiry/view/requirement-summary.tsx
import { Card, Disclosure, FactList, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { budgetLine } from "../model/requirement-facts";
import type { EnquiryRecord } from "../model/wire";

export interface RequirementSummaryProps {
  readonly enquiry: EnquiryRecord;
  readonly collapsible?: boolean;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function RequirementSummary({ enquiry, collapsible = false }: RequirementSummaryProps) {
  const budget = budgetLine(enquiry.budgetMinPaise, enquiry.budgetMaxPaise);
  const brief = enquiry.brief.filter((line) => line.value.trim() !== "");
  const dates = [
    ...(enquiry.requestedStart ? [{ label: "Wants work to start", value: shortDate(enquiry.requestedStart) }] : []),
    ...(enquiry.serviceBy ? [{ label: "Enquiry closes", value: shortDate(enquiry.serviceBy) }] : []),
  ];
  const body = (
    <View className="flex-col gap-4">
      {dates.length > 0 ? <FactList items={dates} /> : null}
      {brief.length > 0 ? (
        <FactList items={brief.map((line) => ({ label: line.question, value: line.value }))} />
      ) : (
        <Text className="text-sm leading-6 text-text-secondary">
          The customer chose the service and a visit time — the details are yours to take on site.
        </Text>
      )}
      {budget ? <FactList items={[{ label: "Customer's budget", value: budget }]} /> : null}
      <Text className="text-xs leading-5 text-text-muted">
        Use this address only to complete this Vsolve visit. The customer’s contact details stay private.
      </Text>
    </View>
  );

  if (collapsible) {
    return (
      <Card className="p-0">
        <Disclosure className="px-4 py-3" summary="What the customer asked for" hint={`${dates.length + brief.length} details`}>
          {body}
        </Disclosure>
      </Card>
    );
  }

  return (
    <Card className="flex-col gap-4 p-4">
      <Text className="text-sm font-semibold text-text">What the customer asked for</Text>
      {body}
    </Card>
  );
}
