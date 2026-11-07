// Ported from frontend/apps/partner/features/capability/view/express-progress.tsx
import { Button, Card, cn, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { ExpressPathView } from "../adapters/express-path";

export interface ExpressProgressProps {
  readonly path: ExpressPathView;
  readonly className?: string;
}

export function ExpressProgress({ path, className }: ExpressProgressProps) {
  const router = useRouter();
  const done = path.steps.filter((step) => step.isComplete).length;

  return (
    <Card className={cn("p-5", className)}>
      <Text className="text-base font-semibold text-text">Start taking work</Text>
      <Text className="mt-1 text-sm text-text-secondary">
        {path.canSeeDemand
          ? "You are set up. Here is what people near you are asking for."
          : `Four short steps. ${path.remaining} to go.`}
      </Text>

      <View accessibilityLabel={`Setup steps, ${done} of ${path.steps.length} done`} className="mt-4 flex-col gap-1">
        {path.steps.map((step) => (
          <Pressable
            key={step.key}
            accessibilityRole="button"
            accessibilityState={{ selected: step.isCurrent }}
            accessibilityLabel={`${step.label}. ${step.isComplete ? "Done" : "Not done yet"}`}
            onPress={() => router.push(step.href as never)}
            className={cn(
              "min-h-12 flex-row items-center gap-3 rounded-control px-3 py-2",
              step.isCurrent && "bg-selected-surface",
            )}
          >
            <View
              className={cn(
                "h-6 w-6 items-center justify-center rounded-full",
                step.isComplete ? "bg-success-surface" : "bg-surface-sunken",
              )}
            >
              {step.isComplete ? <Check size={14} color="#047857" strokeWidth={3} /> : null}
            </View>
            <View className="min-w-0 flex-1">
              <Text className={cn("text-sm font-semibold", step.isComplete ? "text-text-secondary" : "text-text")}>
                {step.label}
              </Text>
              <Text className="text-xs leading-5 text-text-muted">{step.ask}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Button size="lg" block className="mt-5" onPress={() => router.push(path.destination as never)}>
        {path.canSeeDemand ? "See what people need" : "Continue"}
      </Button>

      {path.canSeeDemand ? null : (
        <Text className="mt-3 text-xs leading-5 text-text-muted">
          We ask for documents later, when you accept your first job — not now.
        </Text>
      )}
    </Card>
  );
}
