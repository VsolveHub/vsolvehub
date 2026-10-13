import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { useCategories, useCategoryServices } from "@/features/catalog/client-queries";

export function NewRequestList() {
  const categories = useCategories();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await categories.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-3 px-4 py-6"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Bookings"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/activity");
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <Text className="text-2xl font-extrabold text-text">New request</Text>
      </View>
      <Text className="text-sm text-text-secondary">Describe the work and we will ask professionals to quote.</Text>
      {(categories.data ?? []).map((category) => (
        <CategoryServices key={category.id} slug={category.slug} name={category.name} onOpen={(service) => router.push(`/requests/new/${service}` as never)} />
      ))}
    </ScrollView>
  );
}

function CategoryServices({ slug, name, onOpen }: { slug: string; name: string; onOpen: (service: string) => void }) {
  const services = useCategoryServices(slug);
  return (
    <>
      <Text className="text-base font-bold text-text">{name}</Text>
      {(services.data ?? []).map((service) => (
        <Pressable key={service.id} onPress={() => onOpen(service.slug)} className="rounded-card border border-line bg-surface px-4 py-3">
          <Text className="text-base font-semibold text-text">{service.name}</Text>
        </Pressable>
      ))}
    </>
  );
}
