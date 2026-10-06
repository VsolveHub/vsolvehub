// Ported from frontend/apps/partner/app/work/how-day-hire-works/page.tsx
import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

export function HowDayHireWorks() {
  const router = useRouter();
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-5 px-4 py-5">
      <View className="gap-1">
        <Pressable accessibilityRole="link" onPress={() => router.push("/work")}>
          <Text className="text-sm font-semibold text-action-secondary">← Work</Text>
        </Pressable>
        <Text className="text-2xl font-extrabold leading-tight text-text">How day-hire works</Text>
      </View>
      <Section title="The offer">
        <Text className="text-sm leading-6 text-text-secondary">An offer is a crew size, a number of days, an area and a rate.</Text>
        <Text className="text-sm leading-6 text-text-secondary">The rate is published by Vsolve for your city and skill. It is the same for every lead.</Text>
        <Text className="text-sm leading-6 text-text-secondary">The first lead to take it gets it. The clock on the offer is real minutes, day or night.</Text>
      </Section>
      <Section title="Taking it">
        <Text className="text-sm leading-6 text-text-secondary">Taking the job is taking the published rate. Nothing to quote, nothing to negotiate on site.</Text>
        <Text className="text-sm leading-6 text-text-secondary">Extras — overtime, an add-on — go through the app at the published rates and count only once the customer approves them.</Text>
        <Text className="text-sm leading-6 text-text-secondary">Asking for money above the rate, or cash on the side, is something the customer can report in one tap.</Text>
      </Section>
      <Section title="Held, then confirmed">
        <Text className="text-sm leading-6 text-text-secondary">When you take it first, the job is held for you while the customer pays the booking fee.</Text>
        <Text className="text-sm leading-6 text-text-secondary">{"Don't travel and don't line up your crew on a hold. We ping you the moment it is confirmed."}</Text>
        <Text className="text-sm leading-6 text-text-secondary">If the customer never pays, the hold lapses on its own. Nothing is charged, nothing is owed, nothing counts against you.</Text>
      </Section>
      <Section title="Your money">
        <Text className="text-sm leading-6 text-text-secondary">The customer pays you directly, each evening, for the people who came that day.</Text>
        <Text className="text-sm leading-6 text-text-secondary">Vsolve never holds this money. The booking fee is the only thing Vsolve collects, and the customer pays it.</Text>
        <Text className="text-sm leading-6 text-text-secondary">Each evening both of you get a one-tap prompt at the published amount. Tap it once you are paid; it stays open until you both do.</Text>
      </Section>
      <Section title="Each day">
        <Text className="text-sm leading-6 text-text-secondary">{"Name the crew before the day. Tap \"We've reached\" when you arrive."}</Text>
        <Text className="text-sm leading-6 text-text-secondary">{"In the evening, tick who came and add any extra hours. The app sends the day's amount to the customer."}</Text>
        <Text className="text-sm leading-6 text-text-secondary">The customer confirms the count. If they disagree, support looks at it — the other days carry on.</Text>
      </Section>
      <Section title="Passing on an offer">
        <Text className="text-sm leading-6 text-text-secondary">Passing needs a reason, and the reason is read.</Text>
        <Text className="text-sm leading-6 text-text-secondary">{'"Rate too low" is the one Vsolve acts on fastest: enough of them at one rate and Operations reviews it for your city.'}</Text>
        <Text className="text-sm leading-6 text-text-secondary">Passing never counts against you.</Text>
      </Section>
      <Section title="Problems">
        <Text className="text-sm leading-6 text-text-secondary">Fewer people, a locked gate, an injury, a site that is not ready — use the Problem button on the job.</Text>
        <Text className="text-sm leading-6 text-text-secondary">A safety report never cancels the job. To cancel a job, call support.</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-1.5 rounded-card border border-line bg-surface px-4 py-3.5">
      <Text className="text-base font-bold text-text">{title}</Text>
      <View className="gap-1.5">{children}</View>
    </View>
  );
}
