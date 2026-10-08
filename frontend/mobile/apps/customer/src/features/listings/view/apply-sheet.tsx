import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { AlertCircle, CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";

import { applySchema, parseSkills, type ApplyFormState } from "../model";
import { submitListingApplication, type ListingDetail } from "../queries";

export function ApplySheet({
  listing,
  initialProfile,
  open,
  onOpenChange,
}: {
  listing: ListingDetail;
  initialProfile?: {
    full_name?: string;
    phone?: string;
    email?: string;
    experience_text?: string;
    resume_url?: string;
    skills?: string[];
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ApplyFormState>(() => ({
    name: initialProfile?.full_name || "",
    phone: initialProfile?.phone || "",
    email: initialProfile?.email || "",
    experience: initialProfile?.experience_text || "",
    cover_note: "",
    resume_url: initialProfile?.resume_url || "",
    skills: (initialProfile?.skills || []).join(", "),
    findable: true,
  }));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const parsedSkills = parseSkills(form.skills);
      return submitListingApplication(listing.id, {
        name: form.name,
        phone: form.phone,
        email: form.email,
        experience: form.experience,
        resume_url: form.resume_url,
        cover_note: form.cover_note,
        applicant_snapshot: {
          skills: parsedSkills,
          findable: form.findable,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
      onOpenChange(false);
      router.push("/listings/my-applications" as never);
    },
    onError: (err: any) => {
      setServerError(err?.message || "Application submission failed. Please try again.");
    },
  });

  const handleSubmit = () => {
    setServerError(null);
    setFieldErrors({});

    const result = applySchema.safeParse({
      name: form.name,
      phone: form.phone,
      email: form.email,
      experience: form.experience,
      resume_url: form.resume_url,
      cover_note: form.cover_note,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Apply for Role"
      description={`Submit application to ${listing.partner?.company_name || "Employer"}`}
    >
      <ScrollView className="max-h-[80vh] gap-3.5 py-2" showsVerticalScrollIndicator={false}>
        {serverError ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
            <AlertCircle size={16} color="#dc2626" />
            <Text className="flex-1 text-xs font-medium text-danger">{serverError}</Text>
          </View>
        ) : null}

        {/* Full Name */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Full Name *</Text>
          <TextInput
            placeholder="Your full name"
            value={form.name}
            onChangeText={(name) => setForm((p) => ({ ...p, name }))}
            className={`rounded-xl border p-3 text-xs text-text ${
              fieldErrors.name ? "border-danger bg-danger/5" : "border-line bg-surface"
            }`}
          />
          {fieldErrors.name ? (
            <Text className="text-[10px] text-danger">{fieldErrors.name}</Text>
          ) : null}
        </View>

        {/* Phone Number */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Phone Number *</Text>
          <TextInput
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={(phone) => setForm((p) => ({ ...p, phone }))}
            className={`rounded-xl border p-3 text-xs text-text ${
              fieldErrors.phone ? "border-danger bg-danger/5" : "border-line bg-surface"
            }`}
          />
          {fieldErrors.phone ? (
            <Text className="text-[10px] text-danger">{fieldErrors.phone}</Text>
          ) : null}
        </View>

        {/* Email */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Email Address (Optional)</Text>
          <TextInput
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={(email) => setForm((p) => ({ ...p, email }))}
            className={`rounded-xl border p-3 text-xs text-text ${
              fieldErrors.email ? "border-danger bg-danger/5" : "border-line bg-surface"
            }`}
          />
          {fieldErrors.email ? (
            <Text className="text-[10px] text-danger">{fieldErrors.email}</Text>
          ) : null}
        </View>

        {/* Relevant Experience */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Experience Summary</Text>
          <TextInput
            placeholder="e.g. 3 years as industrial electrician"
            value={form.experience}
            onChangeText={(experience) => setForm((p) => ({ ...p, experience }))}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
          />
        </View>

        {/* Resume URL */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Resume / Portfolio Link</Text>
          <TextInput
            placeholder="https://drive.google.com/... or linkedin link"
            autoCapitalize="none"
            value={form.resume_url}
            onChangeText={(resume_url) => setForm((p) => ({ ...p, resume_url }))}
            className={`rounded-xl border p-3 text-xs text-text ${
              fieldErrors.resume_url ? "border-danger bg-danger/5" : "border-line bg-surface"
            }`}
          />
          {fieldErrors.resume_url ? (
            <Text className="text-[10px] text-danger">{fieldErrors.resume_url}</Text>
          ) : null}
        </View>

        {/* Skills */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Key Skills (comma separated)</Text>
          <TextInput
            placeholder="Wiring, DB Board, Maintenance"
            value={form.skills}
            onChangeText={(skills) => setForm((p) => ({ ...p, skills }))}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
          />
        </View>

        {/* Cover Note */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Note for Hiring Manager</Text>
          <TextInput
            placeholder="Why you're a great fit for this opening..."
            value={form.cover_note}
            onChangeText={(cover_note) => setForm((p) => ({ ...p, cover_note }))}
            multiline
            numberOfLines={3}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-text"
          />
        </View>

        {/* Submit */}
        <Button
          size="lg"
          variant="primary"
          disabled={mutation.isPending}
          onPress={handleSubmit}
          className="mt-2 w-full rounded-xl py-3.5"
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            "Submit Job Application"
          )}
        </Button>
      </ScrollView>
    </Dialog>
  );
}
