import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { AlertCircle, CheckCircle2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, TextInput, View } from "react-native";

import { parseSkills } from "../model";
import { fetchMyJobProfile, saveMyJobProfile } from "../seeker-queries";

export function SeekerProfileForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
  });

  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [experienceText, setExperienceText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [isFindable, setIsFindable] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setHeadline(profile.headline || "");
      setPhone(profile.phone || "");
      setEmail(profile.email || "");
      setExperienceText(profile.experience_text || "");
      setSkillsText((profile.skills || []).join(", "));
      setResumeUrl(profile.resume_url || "");
      setPreferredLocation(profile.preferred_location_text || "");
      setIsFindable(profile.is_findable ?? true);
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: () =>
      saveMyJobProfile({
        full_name: fullName,
        headline,
        phone,
        email,
        experience_text: experienceText,
        skills: parseSkills(skillsText),
        resume_url: resumeUrl,
        preferred_location_text: preferredLocation,
        is_findable: isFindable,
      }),
    onSuccess: async () => {
      setStatusMessage("Job profile updated successfully.");
      await queryClient.invalidateQueries({ queryKey: ["my-job-profile"] });
    },
    onError: (err: any) => {
      setStatusMessage(err?.message || "Failed to save profile.");
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <ActivityIndicator color="#00112e" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 gap-4" showsVerticalScrollIndicator={false}>
      {statusMessage ? (
        <View className="flex-row items-center gap-2 rounded-xl bg-brand/10 p-3">
          <CheckCircle2 size={16} color="#EA580C" />
          <Text className="text-xs font-bold text-brand">{statusMessage}</Text>
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Full Name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your full name"
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Professional Headline</Text>
        <TextInput
          value={headline}
          onChangeText={setHeadline}
          placeholder="e.g. Master Electrician & HVAC Specialist"
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Contact Phone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="10-digit mobile number"
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Email Address</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="name@example.com"
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Skills (comma separated)</Text>
        <TextInput
          value={skillsText}
          onChangeText={setSkillsText}
          placeholder="Wiring, Plumbing, Blueprint Reading"
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Experience Overview</Text>
        <TextInput
          value={experienceText}
          onChangeText={setExperienceText}
          placeholder="Describe your background, licenses, certifications..."
          multiline
          numberOfLines={3}
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Resume / CV Link</Text>
        <TextInput
          value={resumeUrl}
          onChangeText={setResumeUrl}
          autoCapitalize="none"
          placeholder="https://drive.google.com/..."
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-bold text-navy-900">Preferred Location / City</Text>
        <TextInput
          value={preferredLocation}
          onChangeText={setPreferredLocation}
          placeholder="e.g. Hyderabad, HSR Bengaluru"
          className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
        />
      </View>

      <View className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-4">
        <View className="flex-1 pr-4">
          <Text className="text-xs font-bold text-navy-900">Allow employers to discover me</Text>
          <Text className="text-[10px] text-text-secondary">
            Matching businesses can invite you to relevant jobs.
          </Text>
        </View>
        <Switch value={isFindable} onValueChange={setIsFindable} trackColor={{ true: "#EA580C" }} />
      </View>

      <Button
        size="lg"
        variant="primary"
        disabled={mutation.isPending}
        onPress={() => mutation.mutate()}
        className="mt-4 rounded-xl py-3.5"
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : "Save Profile"}
      </Button>
    </ScrollView>
  );
}
