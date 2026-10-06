// Ported from frontend/apps/partner/features/capability/view/demand-list.tsx
import { Badge, Card, cn, EmptyState, Text } from "@vsolve/mobile-ui";
import { MapPin } from "lucide-react-native";
import { View } from "react-native";

import { AsyncSection, type AsyncState } from "@/components/async-section";

import type { DemandCard, DemandView } from "../adapters/demand";

export interface DemandListProps {
  readonly state: AsyncState<DemandView>;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function DemandList({ state, onRetry, className }: DemandListProps) {
  return (
    <AsyncSection
      state={state}
      label="Loading work near you"
      onRetry={onRetry}
      isEmpty={(view) => view.isEmpty}
      empty={<DemandEmpty state={state} />}
    >
      {(view) => (
        <View className={cn("flex-col gap-3", className)}>
          {view.isAllIneligible ? (
            <Text className="rounded-card bg-surface-sunken px-4 py-3 text-sm leading-6 text-text-secondary">
              This is real work being asked for near you. You need approval for these services before you can
              respond — each card says which.
            </Text>
          ) : null}
          <View className="flex-col gap-3">
            {view.cards.map((card) => (
              <DemandRow key={card.id} card={card} />
            ))}
          </View>
          <Text className="text-xs leading-5 text-text-muted">
            Names, phone numbers and exact addresses stay hidden until a customer invites you.
          </Text>
        </View>
      )}
    </AsyncSection>
  );
}

function DemandEmpty({ state }: { state: AsyncState<DemandView> }) {
  const matched = state.status === "ready" ? state.data.matchedServiceCount : 0;
  if (matched === 0) {
    return (
      <EmptyState
        title="Nothing matched your services yet"
        description="You have told us one thing you do and one place you work. Adding another of either widens what reaches you."
      />
    );
  }
  return (
    <EmptyState
      title="Nothing in your area right now"
      description="Work arrives through the day. We will message you when something matches what you do."
    />
  );
}

function DemandRow({ card }: { card: DemandCard }) {
  return (
    <Card className="p-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold text-text">{card.headline}</Text>
        {card.workspaceLabel ? <Badge tone="neutral">{card.workspaceLabel}</Badge> : null}
      </View>
      <View className="mt-2 flex-row items-center gap-1.5">
        <MapPin size={14} color="#756c5e" />
        <Text className="flex-1 text-sm text-text-secondary">{card.areaLabel}</Text>
      </View>
      {card.startsOn === null ? (
        <Text className="mt-1 text-sm text-text-secondary">No start date given yet</Text>
      ) : (
        <Text className="mt-1 text-sm text-text-secondary">
          Starts{" "}
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
            new Date(card.startsOn),
          )}
        </Text>
      )}
      {card.isEligible ? (
        <Text className="mt-3 text-sm font-medium text-success-text">You can be invited to this.</Text>
      ) : (
        <Text className="mt-3 rounded-control bg-surface-sunken px-3 py-2 text-sm leading-6 text-text-secondary">
          {card.hint || "You are not approved for this kind of work yet."}
        </Text>
      )}
    </Card>
  );
}
