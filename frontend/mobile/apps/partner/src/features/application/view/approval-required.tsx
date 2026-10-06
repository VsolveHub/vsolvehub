// Ported from frontend/apps/partner/features/application/view/approval-required.tsx
import { Card, Text } from "@vsolve/mobile-ui";
import { Link } from "expo-router";

export function ApprovalRequired({ detail }: { detail: string }) {
  return (
    <Card className="p-5">
      <Text className="text-base font-bold text-text">You are not approved to take work yet</Text>
      <Text className="mt-2 text-sm leading-6 text-text-secondary">{detail}</Text>
      <Link href="/apply" className="mt-4 font-semibold text-info-text">
        See your application
      </Link>
    </Card>
  );
}
