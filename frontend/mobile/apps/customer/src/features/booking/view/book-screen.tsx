// Ported from frontend/apps/customer/app/(flow)/book/[service]/page.tsx
// and features/booking/view/workspace-boot.tsx
import type { Schemas } from "@vsolve/api-client";
import { Button, EmptyState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { useServiceDetail } from "@/features/catalog/client-queries";

import type { TaskOption } from "./task-picker";
import { BookingWorkspace } from "./workspace";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";

function Configure({ variant, tasks }: { variant: Schemas["ServiceVariantConfiguration"]; tasks: readonly TaskOption[] }) {
  const { dispatch } = useWorkspace();
  useEffect(() => {
    dispatch({
      type: "CONFIGURE",
      rules: {
        variantId: variant.id,
        variantCode: variant.code,
        requiredQuestionCodes: variant.questions.filter((question) => question.is_required).map((question) => question.code),
        availableTaskCodes: tasks.map((task) => task.code),
      },
    });
    // The variant id is what changes the configuration. `tasks` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.id, dispatch]);
  return null;
}

export function BookScreen({ serviceSlug }: { serviceSlug: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ variant?: string }>();
  const serviceQuery = useServiceDetail(serviceSlug);
  const service = serviceQuery.data;

  useEffect(() => {
    if (!service) return;
    if (service.variants.length === 0 && service.request_archetypes.length > 0) {
      router.replace(`/requests/new/${serviceSlug}` as never);
    }
  }, [router, service, serviceSlug]);

  if (serviceQuery.isPending) {
    return (
      <View className="flex-1 gap-3 bg-canvas px-4 pt-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </View>
    );
  }

  if (serviceQuery.isError || !service) {
    return (
      <View className="flex-1 justify-center bg-canvas px-4">
        <EmptyState
          title="We could not find that service"
          description="It may have been renamed or is no longer offered."
          action={<Button onPress={() => router.push("/catalog")}>Browse all services</Button>}
        />
      </View>
    );
  }

  const variantCode = typeof params.variant === "string" ? params.variant : undefined;
  const variant = (variantCode ? service.variants.find((candidate) => candidate.code === variantCode) : undefined) ?? service.variants[0];
  if (!variant) {
    return (
      <View className="flex-1 justify-center bg-canvas px-4">
        <Text className="text-center text-sm text-text-secondary">This service cannot be booked yet.</Text>
      </View>
    );
  }

  const tasks = service.variants.map((candidate) => ({
    code: candidate.code,
    label: candidate.name,
    unitPricePaise: candidate.starting_price.amount_paise,
    description: candidate.description || undefined,
  }));

  return (
    <WorkspaceProvider serviceSlug={service.slug} initialStage="scope">
      <Configure variant={variant} tasks={tasks} />
      <BookingWorkspace service={service} variant={variant} tasks={tasks} minimumSubtotalPaise={null} />
    </WorkspaceProvider>
  );
}
