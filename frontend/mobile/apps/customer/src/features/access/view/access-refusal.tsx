// Ported from frontend/apps/customer/features/access/view/access-refusal.tsx
import { describeError } from "@vsolve/query/native";
import { ErrorState } from "@vsolve/mobile-ui";
import type { ReactNode } from "react";
import { View } from "react-native";

export interface AccessRefusalProps {
  error: unknown;
  attempting: string;
  supportAction?: ReactNode;
  onRetry?: () => void;
  inline?: boolean;
}

export function AccessRefusal({
  error,
  attempting,
  supportAction,
  onRetry,
  inline = true,
}: AccessRefusalProps) {
  if (error === null || error === undefined) return null;

  const presentation = describeError(error, "financial");
  const isSupportOnly = presentation.action?.intent === "contact_support";

  return (
    <View>
      <ErrorState
        title={presentation.title}
        message={
          isSupportOnly
            ? `${presentation.message} We could not let you ${attempting}, and this is not something trying again will fix.`
            : presentation.message
        }
        severity={presentation.severity}
        actionLabel={onRetry === undefined ? undefined : (presentation.action?.label ?? "Try again")}
        onAction={onRetry}
        reference={presentation.reference}
        inline={inline}
      />
      {supportAction !== undefined ? <View className="mt-3">{supportAction}</View> : null}
    </View>
  );
}
