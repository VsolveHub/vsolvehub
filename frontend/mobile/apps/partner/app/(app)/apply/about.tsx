import { View } from "react-native";

import { AboutStep } from "@/features/application/view/about-step";
import { ApplicationEditor } from "@/features/application/view/application-editor";

export default function AboutPage() {
  return (
    <View className="px-4 py-4">
      <ApplicationEditor title="Personal Information" description="Enter your basic profile details for your partner account.">
        <AboutStep />
      </ApplicationEditor>
    </View>
  );
}
