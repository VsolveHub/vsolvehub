import { View } from "react-native";

import { ApplicationEditor } from "@/features/application/view/application-editor";
import { ConsentStep } from "@/features/application/view/consent-step";

export default function ConsentPage() {
  return (
    <View className="px-4 py-4">
      <ApplicationEditor
        title="Agreements"
        description="The terms you are agreeing to as a Partner. We record which version you accepted and when."
        saveLabel="Accept and continue"
      >
        <ConsentStep />
      </ApplicationEditor>
    </View>
  );
}
