import { View } from "react-native";

import { AreasStep } from "@/features/application/view/areas-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";

export default function AreasPage() {
  return (
    <View className="px-4 py-4">
      <ApplicationEditor title="Where you work" description="Choose the areas you will travel to.">
        <AreasStep />
      </ApplicationEditor>
    </View>
  );
}
