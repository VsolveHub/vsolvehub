// Ported from frontend/apps/customer/features/crew/view/crew-about-panel.tsx
import { Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import type { RequirementService } from "@/features/requirement/adapters";

export function hasAboutContent(service: RequirementService): boolean {
  return service.policies.some((policy) => policy.kind !== "PROCESS");
}

function lines(service: RequirementService, kind: string): string[] {
  return service.policies
    .filter((policy) => policy.kind === kind)
    .sort((a, b) => a.display_order - b.display_order)
    .map((policy) => policy.text);
}

function PolicyLines({ title, items, mark }: { title: string; items: string[]; mark: "check" | "cross" }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">{title}</Text>
      <View className="mt-2 gap-1.5">
        {items.map((text) => (
          <View key={text} className="flex-row items-start gap-2.5">
            <Text className={mark === "check" ? "text-success-text" : "text-text-muted"}>{mark === "check" ? "✓" : "✗"}</Text>
            <Text className="flex-1 text-sm leading-6 text-text-secondary">{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CrewAboutPanel({ service }: { service: RequirementService }) {
  const included = lines(service, "INCLUDED");
  const excluded = lines(service, "EXCLUDED");
  const goodToKnow = lines(service, "GOOD_TO_KNOW");
  if (included.length === 0 && excluded.length === 0 && goodToKnow.length === 0) return null;
  return (
    <View className="rounded-[20px] border border-line bg-surface p-5 shadow-sm">
      {service.short_description !== "" ? (
        <Text className="mb-4 text-sm leading-6 text-text-secondary">{service.short_description}</Text>
      ) : null}
      <View className="gap-5">
        <PolicyLines title="What's included" items={included} mark="check" />
        <PolicyLines title="What's not included" items={excluded} mark="cross" />
      </View>
      {goodToKnow.length > 0 ? (
        <Text className="mt-4 border-t border-line/70 pt-3 text-sm leading-6 text-text-secondary">{goodToKnow.join(" ")}</Text>
      ) : null}
    </View>
  );
}
