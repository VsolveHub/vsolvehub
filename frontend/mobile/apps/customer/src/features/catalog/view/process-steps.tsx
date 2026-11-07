// Ported from frontend/apps/customer/features/catalog/components/process-steps.tsx
import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { ServiceDetail } from "@/features/catalog/client-queries";

/**
 * How the visit actually runs, in order. Numbered from array position after the
 * server's `display_order` sort, matching the website phone stack.
 */
export function ProcessSteps({ steps }: { steps: ServiceDetail["policies"] }) {
  const ordered = [...steps].sort((left, right) => left.display_order - right.display_order);

  if (ordered.length === 0) return null;

  return (
    <View className="relative mx-auto mt-8 w-full max-w-4xl flex-col items-start justify-center gap-8">
      {ordered.map((step, index) => (
        <View key={step.id} className="relative z-10 w-full flex-1 flex-col items-center">
          <View accessibilityElementsHidden className="mb-5 size-12 shrink-0 items-center justify-center rounded-full bg-action shadow-sm">
            <Text className="text-center text-[1.1rem] font-bold text-white">{index + 1}</Text>
          </View>
          {step.title ? <Text className="mb-2.5 text-center font-medium text-navy-900">{step.title}</Text> : null}
          <Text className="max-w-[16rem] text-center text-[0.875rem] leading-relaxed text-text-secondary">{step.text}</Text>
        </View>
      ))}
    </View>
  );
}
