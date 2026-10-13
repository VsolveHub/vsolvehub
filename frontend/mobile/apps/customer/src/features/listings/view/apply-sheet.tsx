import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Text } from "@vsolve/mobile-ui";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileText,
  Upload,
  X,
} from "lucide-react-native";

import { isApiRequestError } from "@vsolve/api-client";

import {
  applySchema,
  issuesToFieldErrors,
  parseSkills,
  type ApplyFormState,
} from "../model";
import {
  submitListingApplication,
  uploadListingResume,
  type ListingDetail,
} from "../queries";
import { useResumeUpload } from "../use-document-upload";

export interface ApplySheetProps {
  listing: ListingDetail;
  initialProfile?: {
    full_name?: string;
    phone?: string;
    email?: string;
    experience?: string;
    experience_text?: string;
    resume_url?: string;
    skills?: string[];
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alreadyApplied?: boolean;
}

export function ApplySheet({
  listing,
  initialProfile,
  open,
  onOpenChange,
  alreadyApplied = false,
}: ApplySheetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [duplicateConflict, setDuplicateConflict] = useState(false);
  const [form, setForm] = useState<ApplyFormState>(() => ({
    name: initialProfile?.full_name || "",
    phone: initialProfile?.phone || "",
    email: initialProfile?.email || "",
    experience: initialProfile?.experience || initialProfile?.experience_text || "",
    cover_note: "",
    resume_url: initialProfile?.resume_url || "",
    skills: (initialProfile?.skills || []).join(", "),
    findable: true,
  }));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Resume file upload state
  const {
    pickedFile,
    uploading,
    setUploading,
    error: pickerError,
    setError: setPickerError,
    pickDocument,
    clearPicked,
  } = useResumeUpload();

  const handlePickResume = async () => {
    const file = await pickDocument();
    if (!file) return;

    setUploading(true);
    try {
      const res = await uploadListingResume(listing.id, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      });
      if (res.resume_url) {
        setForm((prev) => ({ ...prev, resume_url: res.resume_url }));
      }
    } catch (err: any) {
      setPickerError(err?.message || "Failed to upload resume file.");
    } finally {
      setUploading(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: () => {
      const parsedSkills = parseSkills(form.skills);
      return submitListingApplication(listing.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        experience: form.experience.trim(),
        resume_url: form.resume_url.trim(),
        cover_note: form.cover_note.trim(),
        skills: parsedSkills,
        findable: form.findable,
        applicant_snapshot: {
          skills: parsedSkills,
          findable: form.findable,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["listing", listing.slug || listing.id] });
      await queryClient.invalidateQueries({ queryKey: ["listing"] });
      onOpenChange(false);
      router.push("/listings/my-applications" as never);
    },
    onError: (err: any) => {
      const isDuplicate =
        (isApiRequestError(err) && (err.code === "application_duplicate" || err.status === 409)) ||
        err?.status === 409 ||
        err?.code === "application_duplicate" ||
        (typeof err?.message === "string" &&
          (err.message.toLowerCase().includes("already applied") ||
            err.message.toLowerCase().includes("duplicate")));

      // Sync applications and listing queries immediately across the app
      void queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
      void queryClient.invalidateQueries({ queryKey: ["listing", listing.slug || listing.id] });
      void queryClient.invalidateQueries({ queryKey: ["listing"] });

      if (isDuplicate) {
        setDuplicateConflict(true);
        setServerError(
          err?.message ||
            "You have already applied to this listing. Track it under My Applications.",
        );
      } else {
        setServerError(err?.message || "Application submission failed. Please try again.");
      }
    },
  });

  const handleProceedToReview = () => {
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
      setFieldErrors(issuesToFieldErrors(result.error));
      return;
    }

    setStep(2);
  };

  const isAlreadySubmitted = alreadyApplied || duplicateConflict;

  const handleReset = () => {
    setStep(1);
    setFieldErrors({});
    setServerError(null);
    setDuplicateConflict(false);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        <View className="max-h-[92%] rounded-t-3xl border-t border-line bg-surface p-5 pb-8 shadow-2xl">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-line pb-3">
            <View>
              <Text className="text-base font-extrabold text-navy-900">
                {isAlreadySubmitted
                  ? "Already Applied"
                  : step === 1
                    ? "Apply for this Role"
                    : "Review Application"}
              </Text>
              <Text className="text-xs text-text-muted mt-0.5">
                {isAlreadySubmitted
                  ? "Application on file"
                  : `Step ${step} of 2 · ${listing.poster_name || "Verified Employer"}`}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={handleClose} className="p-1">
              <X size={18} color="#6B6560" />
            </Pressable>
          </View>

          <ScrollView className="my-3" showsVerticalScrollIndicator={false}>
            {isAlreadySubmitted ? (
              <View className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-50/90 p-4 gap-2">
                <View className="flex-row items-center gap-2">
                  <AlertCircle size={18} color="#d97706" />
                  <Text className="text-xs font-bold text-amber-950">Application already submitted</Text>
                </View>
                <Text className="text-xs leading-relaxed text-amber-900">
                  {serverError || "You have already applied to this listing. Track your progress under My Applications."}
                </Text>
              </View>
            ) : serverError ? (
              <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
                <AlertCircle size={16} color="#dc2626" />
                <Text className="flex-1 text-xs font-semibold text-danger">{serverError}</Text>
              </View>
            ) : null}

            {step === 1 ? (
              <View className="gap-3">
                {/* Full Name */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Full Name *</Text>
                  <TextInput
                    placeholder="Your full name"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    value={form.name}
                    onChangeText={(name) => {
                      setForm((p) => ({ ...p, name }));
                      if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: "" }));
                    }}
                    className={`rounded-xl border p-3 text-xs text-text ${
                      fieldErrors.name ? "border-danger bg-danger/5" : "border-line bg-canvas"
                    }`}
                  />
                  {fieldErrors.name ? (
                    <Text className="text-[11px] font-semibold text-danger">{fieldErrors.name}</Text>
                  ) : null}
                </View>

                {/* Phone */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Mobile Number (10 digits) *</Text>
                  <TextInput
                    placeholder="10-digit mobile number"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={form.phone}
                    onChangeText={(phone) => {
                      setForm((p) => ({ ...p, phone }));
                      if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: "" }));
                    }}
                    className={`rounded-xl border p-3 text-xs text-text ${
                      fieldErrors.phone ? "border-danger bg-danger/5" : "border-line bg-canvas"
                    }`}
                  />
                  {fieldErrors.phone ? (
                    <Text className="text-[11px] font-semibold text-danger">{fieldErrors.phone}</Text>
                  ) : null}
                </View>

                {/* Email */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Email Address (Optional)</Text>
                  <TextInput
                    placeholder="name@example.com"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={form.email}
                    onChangeText={(email) => {
                      setForm((p) => ({ ...p, email }));
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" }));
                    }}
                    className={`rounded-xl border p-3 text-xs text-text ${
                      fieldErrors.email ? "border-danger bg-danger/5" : "border-line bg-canvas"
                    }`}
                  />
                  {fieldErrors.email ? (
                    <Text className="text-[11px] font-semibold text-danger">{fieldErrors.email}</Text>
                  ) : null}
                </View>

                {/* Resume Upload via Document Picker */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Resume / CV (PDF, DOC, DOCX up to 5MB)</Text>
                  <View className="rounded-xl border border-line bg-canvas p-3">
                    {pickedFile || form.resume_url ? (
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2 flex-1">
                          <FileText size={16} color="#f87000" />
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-navy-900" numberOfLines={1}>
                              {pickedFile?.name || "Uploaded Resume"}
                            </Text>
                            {uploading ? (
                              <Text className="text-[10px] text-brand">Uploading to cloud...</Text>
                            ) : (
                              <Text className="text-[10px] text-emerald-700">✓ Ready to attach</Text>
                            )}
                          </View>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            clearPicked();
                            setForm((p) => ({ ...p, resume_url: "" }));
                          }}
                          className="px-2 py-1"
                        >
                          <Text className="text-xs font-bold text-danger">Remove</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handlePickResume}
                        disabled={uploading}
                        className="flex-row items-center justify-center gap-2 py-2"
                      >
                        {uploading ? (
                          <ActivityIndicator size="small" color="#f87000" />
                        ) : (
                          <>
                            <Upload size={16} color="#f87000" />
                            <Text className="text-xs font-bold text-brand">
                              Attach Resume File (PDF/DOC)
                            </Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                  {pickerError ? (
                    <Text className="text-[11px] font-semibold text-danger">{pickerError}</Text>
                  ) : null}
                  {fieldErrors.resume_url ? (
                    <Text className="text-[11px] font-semibold text-danger">{fieldErrors.resume_url}</Text>
                  ) : null}
                </View>

                {/* Experience */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Experience</Text>
                  <TextInput
                    placeholder="e.g. 2 years as industrial electrician, or Fresher"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    maxLength={120}
                    value={form.experience}
                    onChangeText={(experience) => setForm((p) => ({ ...p, experience }))}
                    className="rounded-xl border border-line bg-canvas p-3 text-xs text-text"
                  />
                  {fieldErrors.experience ? (
                    <Text className="text-[11px] font-semibold text-danger">{fieldErrors.experience}</Text>
                  ) : null}
                </View>

                {/* Skills */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Your Skills (Comma-separated)</Text>
                  <TextInput
                    placeholder="Wiring, Plumbing, Blueprint Reading"
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    value={form.skills}
                    onChangeText={(skills) => setForm((p) => ({ ...p, skills }))}
                    className="rounded-xl border border-line bg-canvas p-3 text-xs text-text"
                  />
                </View>

                {/* Cover Note */}
                <View className="gap-1">
                  <Text className="text-xs font-bold text-navy-900">Cover Note (Optional)</Text>
                  <TextInput
                    multiline
                    numberOfLines={3}
                    maxLength={2000}
                    placeholder="Why you're a great fit for this opening..."
                    placeholderTextColor="rgba(107,101,96,0.6)"
                    value={form.cover_note}
                    onChangeText={(cover_note) => setForm((p) => ({ ...p, cover_note }))}
                    className="min-h-16 rounded-xl border border-line bg-canvas p-3 text-xs text-text"
                  />
                </View>

                {/* Discoverability Toggle (W-050) */}
                <View className="flex-row items-start gap-3 rounded-2xl border border-line bg-canvas p-3.5">
                  <Switch
                    value={form.findable}
                    onValueChange={(findable) => setForm((p) => ({ ...p, findable }))}
                  />
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-navy-900">
                      Let other employers with matching jobs find my profile
                    </Text>
                    <Text className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                      They see your name, area, experience and skills, and can invite you to apply.
                      Your phone number is shared only with employers you apply to.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              /* Step 2: Review Application */
              <View className="gap-3">
                <View className="rounded-2xl border border-line bg-canvas p-4 gap-2.5">
                  <Text className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
                    Candidate Snapshot
                  </Text>
                  <View className="flex-row justify-between py-1 border-b border-line/60">
                    <Text className="text-xs text-text-secondary">Full Name</Text>
                    <Text className="text-xs font-bold text-navy-900">{form.name}</Text>
                  </View>
                  <View className="flex-row justify-between py-1 border-b border-line/60">
                    <Text className="text-xs text-text-secondary">Mobile Phone</Text>
                    <Text className="text-xs font-bold text-navy-900">{form.phone}</Text>
                  </View>
                  {form.email ? (
                    <View className="flex-row justify-between py-1 border-b border-line/60">
                      <Text className="text-xs text-text-secondary">Email</Text>
                      <Text className="text-xs font-bold text-navy-900">{form.email}</Text>
                    </View>
                  ) : null}
                  {form.experience ? (
                    <View className="flex-row justify-between py-1 border-b border-line/60">
                      <Text className="text-xs text-text-secondary">Experience</Text>
                      <Text className="text-xs font-bold text-navy-900">{form.experience}</Text>
                    </View>
                  ) : null}
                  {form.skills ? (
                    <View className="flex-row justify-between py-1 border-b border-line/60">
                      <Text className="text-xs text-text-secondary">Skills</Text>
                      <Text className="text-xs font-bold text-navy-900">{form.skills}</Text>
                    </View>
                  ) : null}
                  <View className="flex-row justify-between py-1 border-b border-line/60">
                    <Text className="text-xs text-text-secondary">Resume File</Text>
                    <Text className="text-xs font-bold text-navy-900">
                      {pickedFile?.name ? "Attached File" : form.resume_url ? "Linked" : "None"}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-1">
                    <Text className="text-xs text-text-secondary">Profile Discoverable</Text>
                    <Text className="text-xs font-bold text-navy-900">
                      {form.findable ? "Yes (Open to employers)" : "No (Applied role only)"}
                    </Text>
                  </View>
                </View>

                {form.cover_note ? (
                  <View className="rounded-2xl border border-line bg-canvas p-4 gap-1.5">
                    <Text className="text-xs font-bold text-navy-900">Cover Note</Text>
                    <Text className="text-xs leading-relaxed text-text-secondary">
                      {form.cover_note}
                    </Text>
                  </View>
                ) : null}

                <View className="rounded-xl bg-brand/10 p-3">
                  <Text className="text-[11px] leading-relaxed text-brand font-medium">
                    Please verify your phone number. The employer will receive your direct
                    profile to schedule interviews.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View className="pt-2 border-t border-line">
            {isAlreadySubmitted ? (
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={handleClose}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onPress={() => {
                    handleClose();
                    router.push("/listings/my-applications" as never);
                  }}
                  className="flex-1"
                >
                  Track Applications →
                </Button>
              </View>
            ) : step === 1 ? (
              <Button
                variant="primary"
                size="lg"
                onPress={handleProceedToReview}
                className="w-full"
              >
                Review Application →
              </Button>
            ) : (
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={() => setStep(1)}
                  className="flex-1 flex-row items-center justify-center gap-1"
                >
                  <ArrowLeft size={16} color="#00112e" />
                  <Text className="text-xs font-bold text-navy-900">Edit</Text>
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onPress={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending}
                  className="flex-1"
                >
                  {submitMutation.isPending ? "Submitting..." : "Confirm & Send"}
                </Button>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
