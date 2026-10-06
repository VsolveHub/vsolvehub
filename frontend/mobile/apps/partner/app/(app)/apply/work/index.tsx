import { ErrorState, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

import { ApplicationEditor } from "@/features/application/view/application-editor";
import { WorkStep } from "@/features/application/view/work-step";
import { useWorkCatalog } from "@/features/catalog/queries";

export default function WorkPage() {
  const catalog = useWorkCatalog();
  if (catalog.isPending) return <Text className="px-4 py-8 text-text-secondary">Loading categories…</Text>;
  if (catalog.isError || !catalog.data) {
    return (
      <ErrorState
        title="Could not load categories"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void catalog.refetch()}
      />
    );
  }
  return (
    <View className="px-4 py-4">
      <ApplicationEditor
        title="Your trades"
        description="Choose your main categories and the job types you want under each one."
      >
        <WorkStep mainCategories={catalog.data.mainCategories} services={catalog.data.services} />
      </ApplicationEditor>
    </View>
  );
}
