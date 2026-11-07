// Ported from frontend/apps/customer/features/catalog/components/fit-out-service-picker.tsx
import { Button, Card, Dialog, Text, cn } from "@vsolve/mobile-ui";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SvgXml } from "react-native-svg";

import {
  FIT_OUT_SERVICE_OPTIONS,
  fitOutServiceArtwork,
  type FitOutServiceOption,
} from "@/features/requirement/model/fit-out-services";

function requestHref(serviceSlug: string, option: FitOutServiceOption): string {
  const query = new URLSearchParams({ selected_service: option.value });
  return `/requests/new/${serviceSlug}?${query.toString()}`;
}

function artworkXml(option: FitOutServiceOption): string {
  const uri = fitOutServiceArtwork(option);
  const prefix = "data:image/svg+xml;charset=UTF-8,";
  return uri.startsWith(prefix) ? decodeURIComponent(uri.slice(prefix.length)) : uri;
}

function DetailList({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly string[];
  tone: "included" | "excluded";
}) {
  return (
    <View
      className={cn(
        "rounded-card border p-4",
        tone === "included" ? "border-success-line bg-success-surface" : "border-line bg-surface-sunken",
      )}
    >
      <Text className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">{title}</Text>
      <View className="mt-3 gap-2">
        {items.map((item) => (
          <View key={item} className="flex-row gap-2">
            <Text className={tone === "included" ? "font-bold text-success-text" : "text-text-muted"}>
              {tone === "included" ? "+" : "-"}
            </Text>
            <Text className="flex-1 text-sm leading-6 text-text">{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Artwork({ option, height }: { option: FitOutServiceOption; height: number }) {
  return (
    <View style={{ height }} className="overflow-hidden">
      <SvgXml xml={artworkXml(option)} width="100%" height={height} />
    </View>
  );
}

function FitOutCard({ option, onOpen }: { option: FitOutServiceOption; onOpen: (option: FitOutServiceOption) => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen(option)}>
      <Card padding="none" className="overflow-hidden border-line-strong">
        <View className="p-4">
          <View className="relative overflow-hidden rounded-[18px] border border-white/10 bg-surface-sunken">
            <Artwork option={option} height={144} />
            <View className="absolute left-3 top-3 overflow-hidden rounded-full">
              <BlurView intensity={24} tint="light">
                <Text className="bg-surface/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-text">
                  {option.eyebrow}
                </Text>
              </BlurView>
            </View>
          </View>

          <View className="mt-4">
            <Text className="text-base font-bold text-text">{option.label}</Text>
            <Text className="mt-1 text-sm leading-6 text-text-secondary">{option.description}</Text>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {option.facts.map((fact) => (
              <View key={fact} className="rounded-full bg-surface-sunken px-2.5 py-1">
                <Text className="text-xs font-medium text-text-secondary">{fact}</Text>
              </View>
            ))}
          </View>

          <Text className="mt-4 text-sm font-semibold text-text-link">View details and choose</Text>
        </View>
      </Card>
    </Pressable>
  );
}

function FaqItem({ question, answer, first = false }: { question: string; answer: string; first?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View className={first ? "py-3" : "border-t border-line py-3"}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)}>
        <Text className="text-sm font-semibold text-text">{question}</Text>
      </Pressable>
      {open ? <Text className="mt-2 text-sm leading-6 text-text-secondary">{answer}</Text> : null}
    </View>
  );
}

export function FitOutServicePicker({ serviceSlug }: { serviceSlug: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<FitOutServiceOption | null>(null);

  return (
    <View className="border-y border-line py-7">
      <View className="max-w-2xl">
        <Text className="text-xs font-bold uppercase tracking-[0.14em] text-text-muted">Pick the closest service</Text>
        <Text className="mt-2 text-xl font-bold text-text">Choose one fit-out type</Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">
          No typing needed. Open a service, check what is included and not included, then continue with that selection.
        </Text>
      </View>

      <View className="mt-5 gap-4">
        {FIT_OUT_SERVICE_OPTIONS.map((option) => (
          <FitOutCard key={option.value} option={option} onOpen={setSelected} />
        ))}
      </View>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.label ?? "Service details"}
        description={selected?.description}
        className="max-w-4xl"
        footer={
          selected === null ? null : (
            <>
              <Button variant="outline" onPress={() => setSelected(null)}>
                Close
              </Button>
              <Button onPress={() => router.push(requestHref(serviceSlug, selected) as never)}>
                Continue with this service
              </Button>
            </>
          )
        }
      >
        {selected === null ? null : (
          <ScrollView style={{ maxHeight: 420 }} contentContainerClassName="gap-5 pb-3">
            <View className="gap-4">
              <View className="rounded-card border border-line bg-surface-sunken p-4">
                <Text className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">Good fit when</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {selected.facts.map((fact) => (
                    <View key={fact} className="rounded-full bg-surface px-2.5 py-1">
                      <Text className="text-xs font-semibold text-text-secondary">{fact}</Text>
                    </View>
                  ))}
                </View>
                <Text className="mt-4 text-sm leading-6 text-text-secondary">
                  We will save this as your service selection and ask only for location and timing next.
                </Text>
              </View>
              <View className="min-h-44 overflow-hidden rounded-[20px]">
                <Artwork option={selected} height={176} />
              </View>
            </View>

            <View className="gap-4">
              <DetailList title="What is included" items={selected.included} tone="included" />
              <DetailList title="What is not included" items={selected.notIncluded} tone="excluded" />
            </View>

            <View className="rounded-card border border-line bg-surface p-4">
              <Text className="text-xs font-bold uppercase tracking-[0.12em] text-text-secondary">FAQs</Text>
              <View className="mt-3">
                {selected.faqs.map((faq, index) => (
                  <FaqItem key={faq.question} question={faq.question} answer={faq.answer} first={index === 0} />
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </Dialog>
    </View>
  );
}
