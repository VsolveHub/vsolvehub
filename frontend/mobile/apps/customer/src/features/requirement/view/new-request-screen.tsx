import { describeError } from "@vsolve/query/native";
import { Button, Input, Spinner, Text } from "@vsolve/mobile-ui";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock,
  MapPin,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { useAddresses } from "@/features/addresses/queries";
import { useChooseVisitPlan } from "@/features/access/queries";
import { useServiceDetail } from "@/features/catalog/client-queries";
import {
  useCreateRequirement,
  useProbableDuplicates,
  useSaveRequirement,
  useSubmitRequirement,
} from "@/features/requirement/queries";

const PHOTO_LIMIT = 6;

function getUpcomingDateOptions() {
  const options: { label: string; isoDate: string }[] = [];
  const start = new Date();
  start.setDate(start.getDate() + 1); // default to tomorrow
  start.setHours(9, 0, 0, 0);

  for (let i = 0; i < 5; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayName =
      i === 0
        ? "Tomorrow"
        : new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(d);
    const dayMonth = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
    }).format(d);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    options.push({ label: `${dayName}, ${dayMonth}`, isoDate: `${yyyy}-${mm}-${dd}` });
  }
  return options;
}

const TIME_SLOTS = [
  { label: "Morning (9:00 AM)", time: "09:00:00" },
  { label: "Afternoon (1:00 PM)", time: "13:00:00" },
  { label: "Evening (4:00 PM)", time: "16:00:00" },
];

export function NewRequestScreen({ serviceSlug }: { serviceSlug: string }) {
  const service = useServiceDetail(serviceSlug);
  const params = useLocalSearchParams<{ selected_service?: string }>();
  const variant = service.data?.requirement_variants[0];
  const variantId = variant?.id ?? service.data?.bookable_variant_id ?? null;
  const questions = variant?.questions ?? [];
  const isA5 =
    variant?.fulfilment_archetype === "A5_CUSTOM_PROJECT" ||
    service.data?.name?.toLowerCase().includes("project") ||
    service.data?.name?.toLowerCase().includes("fit-out") ||
    serviceSlug.includes("project") ||
    serviceSlug.includes("fit-out");

  const handleRefresh = async () => {
    await service.refetch();
  };

  if (service.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Spinner size="md" />
        <Text className="mt-3 text-sm font-semibold text-slate-600">
          Loading service details…
        </Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <SimpleRequest
        serviceName={service.data?.name ?? "Request"}
        variantId={variantId}
        onRefresh={handleRefresh}
        isA5={isA5}
      />
    );
  }

  return (
    <QuestionRequest
      serviceName={service.data?.name ?? "Request"}
      variantId={variantId}
      questions={questions}
      selectedService={params.selected_service}
      onRefresh={handleRefresh}
      isA5={isA5}
    />
  );
}

function SimpleRequest({
  serviceName,
  variantId,
  onRefresh,
  isA5,
}: {
  serviceName: string;
  variantId: string | null;
  onRefresh?: () => Promise<void>;
  isA5?: boolean;
}) {
  const create = useCreateRequirement();
  const save = useSaveRequirement();
  const submit = useSubmitRequirement();
  const choosePlan = useChooseVisitPlan();
  const router = useRouter();
  const [details, setDetails] = useState("");
  const [planSize, setPlanSize] = useState<number>(2);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  function send() {
    if (!variantId) return;
    create.mutate(
      { variantId, answers: { details }, language: "en" },
      {
        onSuccess: (draft) => {
          save.mutate(
            { requirementId: draft.id, additionalDetails: details },
            {
              onSuccess: async () => {
                if (isA5 || planSize) {
                  try {
                    await choosePlan.mutateAsync({
                      requirementId: draft.id,
                      planSize: planSize || 2,
                    });
                  } catch (planError: any) {
                    console.warn("Visit plan note:", planError?.message);
                  }
                }
                submit.mutate(
                  { requirementId: draft.id, allowDuplicate: false },
                  {
                    onSuccess: () => router.replace(`/requests/${draft.id}` as never),
                    onError: async (err: any) => {
                      const errMsg = (err?.message || "").toLowerCase();
                      if (
                        errMsg.includes("visit") ||
                        errMsg.includes("professional") ||
                        err?.code === "m2_visit_plan_required"
                      ) {
                        try {
                          await choosePlan.mutateAsync({
                            requirementId: draft.id,
                            planSize: planSize || 2,
                          });
                          submit.mutate(
                            { requirementId: draft.id, allowDuplicate: false },
                            {
                              onSuccess: () => router.replace(`/requests/${draft.id}` as never),
                              onError: (retryErr: any) => {
                                Alert.alert("Submission Notice", retryErr?.message || "Could not complete request.");
                              },
                            },
                          );
                          return;
                        } catch {
                          // proceed to alert
                        }
                      }
                      Alert.alert("Submission Notice", err?.message || "Could not complete request.");
                    },
                  },
                );
              },
            },
          );
        },
      },
    );
  }

  const isSubmitting = create.isPending || save.isPending || submit.isPending || choosePlan.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="gap-4 px-4 py-5 pb-20"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        }
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/catalog");
              }
            }}
            className="size-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-2xs active:bg-slate-100"
          >
            <ChevronLeft size={20} color="#0B1B3D" strokeWidth={2.4} />
          </Pressable>
          <Text className="text-2xl font-black tracking-tight text-[#0B1B3D]">
            {serviceName}
          </Text>
        </View>

        <Text className="text-sm text-slate-500 leading-relaxed">
          Tell us what you need. Verified professionals quote from this.
        </Text>

        <View className="gap-2 pt-2">
          <Text className="text-sm font-bold text-[#0B1B3D]">Job description *</Text>
          <Input
            value={details}
            onChangeText={setDetails}
            placeholder="What needs doing"
            multiline
            numberOfLines={4}
            className="min-h-[100px] rounded-2xl border border-slate-200 p-3.5 text-sm"
          />
        </View>

        {/* Visit Plan Chooser if Project */}
        {isA5 ? (
          <View className="rounded-2xl border border-slate-200 bg-white p-4 gap-3 shadow-2xs">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-bold text-[#0B1B3D]">
                  How many professionals should visit?
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  Verified professionals visit your site to assess and provide quotes.
                </Text>
              </View>
              <View className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 self-start">
                <Text className="text-[10px] font-bold text-emerald-700">Free visits</Text>
              </View>
            </View>

            <View className="gap-2 pt-1">
              {[
                { size: 1, label: "1 Professional", desc: "1 on-site estimate" },
                { size: 2, label: "2 Professionals", desc: "Compare 2 quotes", badge: "Recommended" },
                { size: 3, label: "3 Professionals", desc: "Compare 3 quotes for best match" },
              ].map((tier) => {
                const isSelected = planSize === tier.size;
                return (
                  <Pressable
                    key={tier.size}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setPlanSize(tier.size)}
                    className={`flex-row items-center justify-between rounded-2xl p-3.5 shadow-2xs ${
                      isSelected
                        ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                        : "border border-slate-200 bg-white active:bg-slate-50"
                    }`}
                  >
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className={`text-sm ${
                            isSelected ? "font-bold text-[#0B1B3D]" : "font-semibold text-slate-800"
                          }`}
                        >
                          {tier.label}
                        </Text>
                        {tier.badge ? (
                          <View className="rounded-full bg-orange-100 px-2 py-0.5">
                            <Text className="text-[10px] font-bold text-[#EA580C]">
                              {tier.badge}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-xs text-slate-500 mt-0.5">{tier.desc}</Text>
                    </View>
                    {isSelected ? (
                      <CheckCircle2 size={20} color="#EA580C" />
                    ) : (
                      <Circle size={20} color="#CBD5E1" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {create.error ? (
          <View className="rounded-xl border border-red-200 bg-red-50 p-3">
            <Text className="text-xs font-semibold text-red-700">
              {describeError(create.error, "mutation").message}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send request"
          disabled={!variantId || details.trim() === "" || isSubmitting}
          onPress={send}
          className={`w-full items-center justify-center rounded-xl py-3.5 shadow-2xs ${
            !variantId || details.trim() === "" || isSubmitting
              ? "bg-slate-200 opacity-60"
              : "bg-[#EA580C] active:bg-[#C2410C]"
          }`}
        >
          {isSubmitting ? (
            <View className="flex-row items-center gap-2">
              <Spinner size="sm" color="#ffffff" />
              <Text className="text-base font-bold text-white">Sending request…</Text>
            </View>
          ) : (
            <Text className="text-base font-bold text-white">Send request</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function QuestionRequest({
  serviceName,
  variantId,
  questions,
  selectedService,
  onRefresh,
  isA5,
}: {
  serviceName: string;
  variantId: string | null;
  questions: NonNullable<
    ReturnType<typeof useServiceDetail>["data"]
  >["requirement_variants"][number]["questions"];
  selectedService?: string;
  onRefresh?: () => Promise<void>;
  isA5?: boolean;
}) {
  const create = useCreateRequirement();
  const save = useSaveRequirement();
  const submit = useSubmitRequirement();
  const choosePlan = useChooseVisitPlan();
  const addresses = useAddresses();
  const router = useRouter();

  const [step, setStep] = useState<"what" | "where" | "send">("what");
  const [answers, setAnswers] = useState<Record<string, string>>(
    selectedService ? { selected_service: selectedService } : {},
  );
  const [addressId, setAddressId] = useState<string | null>(null);
  const [planSize, setPlanSize] = useState<number>(2);

  // Date and Time selection states
  const dateOptions = useMemo(() => getUpcomingDateOptions(), []);
  const [selectedDate, setSelectedDate] = useState<string>(dateOptions[0]?.isoDate ?? "");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(TIME_SLOTS[0]?.time ?? "09:00:00");
  const [photos, setPhotos] = useState<string[]>([]);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-select first address when loaded
  useEffect(() => {
    if (!addressId && (addresses.data ?? []).length > 0) {
      setAddressId(addresses.data![0].id);
    }
  }, [addressId, addresses.data]);

  // Construct ISO datetime string: e.g. 2026-10-28T09:00:00+05:30
  const effectiveWhen = useMemo(() => {
    if (!selectedDate) return "";
    return `${selectedDate}T${selectedTimeSlot}+05:30`;
  }, [selectedDate, selectedTimeSlot]);

  const duplicates = useProbableDuplicates(
    addressId && effectiveWhen && variantId
      ? { addressId, requestedStart: effectiveWhen, variantId }
      : null,
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([onRefresh?.(), addresses.refetch()]);
    setRefreshing(false);
  };

  function setAnswer(code: string, value: string) {
    setAnswers((current) => ({ ...current, [code]: value }));
  }

  async function addPhoto() {
    if (photos.length >= PHOTO_LIMIT) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) return;
      setPhotos((current) => [...current, asset.fileName ?? `photo_${Date.now()}.jpg`]);
    } catch {
      Alert.alert("Permission", "Could not open photo library.");
    }
  }

  function removePhoto(indexToRemove: number) {
    setPhotos((current) => current.filter((_, i) => i !== indexToRemove));
  }

  function handleContinueFromWhat() {
    // If questions exist, check that at least one is answered or proceed
    setStep("where");
  }

  function handleContinueFromWhere() {
    if (!addressId && (addresses.data ?? []).length > 0) {
      setAddressId(addresses.data![0].id);
    }
    if (!addressId && (addresses.data ?? []).length === 0) {
      Alert.alert("Address Required", "Please add or select a delivery address.");
      return;
    }
    setStep("send");
  }

  function send() {
    const finalAddressId = addressId ?? addresses.data?.[0]?.id;
    if (!variantId) {
      Alert.alert("Notice", "Service variant is not ready. Please try again.");
      return;
    }
    if (!finalAddressId) {
      Alert.alert("Address Required", "Please select a service address in Step 2.");
      setStep("where");
      return;
    }

    const photoNote = photos.length > 0 ? `Photos: ${photos.join(", ")}` : "";
    create.mutate(
      { variantId, answers, language: "en" },
      {
        onSuccess: (draft) => {
          save.mutate(
            {
              requirementId: draft.id,
              addressId: finalAddressId,
              requestedStart: effectiveWhen || undefined,
              additionalDetails: photoNote || undefined,
            },
            {
              onSuccess: async () => {
                if (isA5 || planSize) {
                  try {
                    await choosePlan.mutateAsync({
                      requirementId: draft.id,
                      planSize: planSize || 2,
                    });
                  } catch (planError: any) {
                    console.warn("Visit plan note:", planError?.message);
                  }
                }
                submit.mutate(
                  { requirementId: draft.id, allowDuplicate },
                  {
                    onSuccess: () => {
                      router.replace(`/requests/${draft.id}` as never);
                    },
                    onError: async (err: any) => {
                      const errMsg = (err?.message || "").toLowerCase();
                      if (
                        errMsg.includes("visit") ||
                        errMsg.includes("professional") ||
                        err?.code === "m2_visit_plan_required"
                      ) {
                        try {
                          await choosePlan.mutateAsync({
                            requirementId: draft.id,
                            planSize: planSize || 2,
                          });
                          submit.mutate(
                            { requirementId: draft.id, allowDuplicate },
                            {
                              onSuccess: () => {
                                router.replace(`/requests/${draft.id}` as never);
                              },
                              onError: (retryErr: any) => {
                                Alert.alert(
                                  "Submission Notice",
                                  retryErr?.message || "Could not complete request. Please verify and try again.",
                                );
                              },
                            },
                          );
                          return;
                        } catch {
                          // proceed to standard alert
                        }
                      }
                      Alert.alert(
                        "Submission Notice",
                        err?.message || "Could not complete request. Please verify and try again.",
                      );
                    },
                  },
                );
              },
              onError: (err: any) => {
                Alert.alert(
                  "Save Notice",
                  err?.message || "Could not save request details. Please try again.",
                );
              },
            },
          );
        },
        onError: (err: any) => {
          Alert.alert(
            "Request Notice",
            err?.message || "Could not create request. Please try again.",
          );
        },
      },
    );
  }

  const selectedAddress = (addresses.data ?? []).find((a) => a.id === addressId);
  const selectedDateObj = dateOptions.find((d) => d.isoDate === selectedDate);
  const selectedTimeObj = TIME_SLOTS.find((t) => t.time === selectedTimeSlot);
  const isSubmitting = create.isPending || save.isPending || submit.isPending || choosePlan.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="gap-4 px-4 pt-3 pb-24"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        }
      >
        {/* Header Row */}
        <View className="flex-row items-center gap-3 pt-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            onPress={() => {
              if (step === "send") {
                setStep("where");
              } else if (step === "where") {
                setStep("what");
              } else if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/catalog");
              }
            }}
            className="size-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-2xs active:bg-slate-100"
          >
            <ChevronLeft size={22} color="#0B1B3D" strokeWidth={2.4} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-2xl font-black tracking-tight text-[#0B1B3D]">
              {serviceName}
            </Text>
          </View>
        </View>

        {/* Step indicator */}
        <Text className="text-xs font-semibold text-slate-500">
          {step === "what"
            ? "Step 1 of 3 — What needs doing?"
            : step === "where"
              ? "Step 2 of 3 — Where and when?"
              : "Step 3 of 3 — Choose visits and send"}
        </Text>

        {/* ──────── STEP 1: What needs doing? ──────── */}
        {step === "what" ? (
          <View className="gap-5 pt-1">
            {questions.map((question) => {
              const currentValue = answers[question.code];
              return (
                <View key={question.id} className="gap-2.5">
                  <Text className="text-base font-bold text-[#0B1B3D]">
                    {question.prompt}
                  </Text>

                  {/* Single Choice or Multiple Choice Options */}
                  {question.kind === "SINGLE_CHOICE" || question.kind === "MULTIPLE_CHOICE" ? (
                    <View className="gap-2.5">
                      {question.options.map((option) => {
                        const isSelected = currentValue === option.code;
                        return (
                          <Pressable
                            key={option.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            onPress={() => setAnswer(question.code, option.code)}
                            className={`flex-row items-center justify-between rounded-2xl p-4 shadow-2xs ${
                              isSelected
                                ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                                : "border border-slate-200 bg-white active:bg-slate-50"
                            }`}
                          >
                            <Text
                              className={`text-sm ${
                                isSelected ? "font-bold text-[#0B1B3D]" : "font-semibold text-slate-700"
                              }`}
                            >
                              {option.label}
                            </Text>
                            {isSelected ? (
                              <CheckCircle2 size={20} color="#EA580C" />
                            ) : (
                              <Circle size={20} color="#CBD5E1" />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Boolean Yes / No */}
                  {question.kind === "BOOLEAN" ? (
                    <View className="flex-row gap-3">
                      {["Yes", "No"].map((choice) => {
                        const isSelected = currentValue === choice;
                        return (
                          <Pressable
                            key={choice}
                            accessibilityRole="button"
                            onPress={() => setAnswer(question.code, choice)}
                            className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${
                              isSelected
                                ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                                : "border border-slate-200 bg-white active:bg-slate-50"
                            }`}
                          >
                            <Text
                              className={`text-sm ${
                                isSelected ? "font-bold text-[#EA580C]" : "font-semibold text-slate-700"
                              }`}
                            >
                              {choice}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Text / Number Input */}
                  {question.kind === "TEXT" || question.kind === "NUMBER" ? (
                    <Input
                      value={currentValue ?? ""}
                      onChangeText={(val) => setAnswer(question.code, val)}
                      keyboardType={question.kind === "NUMBER" ? "number-pad" : "default"}
                      placeholder={question.help_text || question.prompt}
                      className="rounded-2xl border border-slate-200 bg-white p-3.5 text-sm"
                    />
                  ) : null}
                </View>
              );
            })}

            {/* Step 1 Continue Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to Step 2"
              onPress={handleContinueFromWhat}
              className="mt-2 w-full items-center justify-center rounded-xl bg-[#EA580C] py-3.5 shadow-2xs active:bg-[#C2410C]"
            >
              <Text className="text-base font-bold text-white">Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ──────── STEP 2: Where and when? ──────── */}
        {step === "where" ? (
          <View className="gap-5 pt-1">
            {/* Address Selection */}
            <View className="gap-2.5">
              <Text className="text-base font-bold text-[#0B1B3D]">
                Where is the work?
              </Text>
              {(addresses.data ?? []).length === 0 ? (
                <View className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 items-center justify-center">
                  <Text className="text-sm font-semibold text-slate-700">
                    No saved addresses found
                  </Text>
                </View>
              ) : (
                (addresses.data ?? []).map((address) => {
                  const isSelected = addressId === address.id;
                  return (
                    <Pressable
                      key={address.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setAddressId(address.id)}
                      className={`flex-row items-center justify-between rounded-2xl p-4 shadow-2xs ${
                        isSelected
                          ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                          : "border border-slate-200 bg-white active:bg-slate-50"
                      }`}
                    >
                      <View className="min-w-0 flex-1 pr-3">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-bold text-[#0B1B3D]">
                            {address.label}
                          </Text>
                          {address.is_default ? (
                            <View className="rounded-full bg-slate-100 px-2 py-0.5">
                              <Text className="text-[10px] font-semibold text-slate-600">
                                Default
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {address.line1}
                          {address.locality ? `, ${address.locality}` : ""}
                        </Text>
                      </View>
                      {isSelected ? (
                        <CheckCircle2 size={22} color="#EA580C" />
                      ) : (
                        <Circle size={22} color="#CBD5E1" />
                      )}
                    </Pressable>
                  );
                })
              )}
            </View>

            {/* Date & Time Selection (No Manual Typing, Zero Keyboard Covering) */}
            <View className="gap-2.5">
              <View className="flex-row items-center gap-1">
                <Text className="text-base font-bold text-[#0B1B3D]">When should we come?</Text>
                <Text className="text-base font-bold text-red-500">*</Text>
              </View>

              {/* Date Pills */}
              <Text className="text-xs font-semibold text-slate-500">Select Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                <View className="flex-row gap-2 px-1">
                  {dateOptions.map((opt) => {
                    const isSelected = selectedDate === opt.isoDate;
                    return (
                      <Pressable
                        key={opt.isoDate}
                        accessibilityRole="button"
                        onPress={() => setSelectedDate(opt.isoDate)}
                        className={`rounded-2xl px-3.5 py-2.5 items-center justify-center shadow-2xs ${
                          isSelected
                            ? "border-2 border-blue-600 bg-[#EFF6FF]"
                            : "border border-slate-200 bg-white active:bg-slate-50"
                        }`}
                      >
                        <Text
                          className={`text-xs ${
                            isSelected ? "font-bold text-[#0B1B3D]" : "font-semibold text-slate-700"
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Time Slot Pills */}
              <Text className="mt-1 text-xs font-semibold text-slate-500">Select Preferred Window</Text>
              <View className="flex-row gap-2">
                {TIME_SLOTS.map((slot) => {
                  const isSelected = selectedTimeSlot === slot.time;
                  return (
                    <Pressable
                      key={slot.time}
                      accessibilityRole="button"
                      onPress={() => setSelectedTimeSlot(slot.time)}
                      className={`flex-1 rounded-2xl py-2.5 items-center justify-center shadow-2xs ${
                        isSelected
                          ? "border-2 border-blue-600 bg-[#EFF6FF]"
                          : "border border-slate-200 bg-white active:bg-slate-50"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          isSelected ? "font-bold text-[#0B1B3D]" : "font-semibold text-slate-700"
                        }`}
                      >
                        {slot.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Formatted Schedule Summary Box */}
              <View className="flex-row items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 mt-1">
                <Clock size={15} color="#64748B" />
                <Text className="text-xs font-semibold text-slate-700">
                  Scheduled for: {selectedDateObj?.label ?? "Tomorrow"} at{" "}
                  {selectedTimeObj?.label ?? "Morning"}
                </Text>
              </View>
            </View>

            {/* Photos Upload Button & Previews */}
            <View className="gap-2 pt-1">
              <Text className="text-base font-bold text-[#0B1B3D]">Attach Photos (Optional)</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                onPress={() => void addPhoto()}
                className="flex-row items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3 shadow-2xs active:bg-slate-50"
              >
                <Camera size={18} color="#0B1B3D" />
                <Text className="text-sm font-bold text-[#0B1B3D]">
                  {`Add a photo (${photos.length}/${PHOTO_LIMIT})`}
                </Text>
              </Pressable>

              {photos.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 pt-1">
                  {photos.map((name, idx) => (
                    <View
                      key={`${name}-${idx}`}
                      className="flex-row items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1"
                    >
                      <Text numberOfLines={1} className="max-w-[150px] text-xs font-medium text-slate-700">
                        {name}
                      </Text>
                      <Pressable hitSlop={6} onPress={() => removePhoto(idx)}>
                        <X size={13} color="#64748B" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Step 2 Continue Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to Review"
              onPress={handleContinueFromWhere}
              className="mt-2 w-full items-center justify-center rounded-xl bg-[#EA580C] py-3.5 shadow-2xs active:bg-[#C2410C]"
            >
              <Text className="text-base font-bold text-white">Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ──────── STEP 3: Review and send ──────── */}
        {step === "send" ? (
          <View className="gap-4 pt-1">
            {/* Request Summary Card */}
            <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4 gap-3 shadow-2xs">
              <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Request Summary
              </Text>

              {/* Service & Problem */}
              <View className="gap-0.5">
                <Text className="text-xs text-slate-500">Service Category</Text>
                <Text className="text-sm font-bold text-[#0B1B3D]">{serviceName}</Text>
              </View>

              {/* Answers */}
              {Object.entries(answers).length > 0 ? (
                <View className="gap-0.5">
                  <Text className="text-xs text-slate-500">Work Scope</Text>
                  <Text className="text-sm font-bold text-[#0B1B3D]">
                    {Object.values(answers).join(", ")}
                  </Text>
                </View>
              ) : null}

              {/* Address */}
              <View className="gap-0.5">
                <Text className="text-xs text-slate-500">Location</Text>
                <Text className="text-sm font-bold text-[#0B1B3D]">
                  {selectedAddress
                    ? `${selectedAddress.label} — ${selectedAddress.line1}`
                    : "Primary address"}
                </Text>
              </View>

              {/* When */}
              <View className="gap-0.5">
                <Text className="text-xs text-slate-500">Target Schedule</Text>
                <Text className="text-sm font-bold text-[#0B1B3D]">
                  {selectedDateObj?.label ?? "Tomorrow"} at{" "}
                  {selectedTimeObj?.label ?? "Morning (9:00 AM)"}
                </Text>
              </View>

              {/* Photos */}
              {photos.length > 0 ? (
                <View className="gap-1 pt-1 border-t border-slate-200/80">
                  <Text className="text-xs text-slate-500">Attached Photos</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {photos.map((name, i) => (
                      <View key={i} className="rounded-md bg-white border border-slate-200 px-2 py-0.5">
                        <Text numberOfLines={1} className="text-[11px] font-medium text-slate-600">
                          {name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Visit Plan Chooser for A5 / Project Services */}
            <View className="rounded-2xl border border-slate-200 bg-white p-4 gap-3 shadow-2xs">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-[#0B1B3D]">
                    How many professionals should visit?
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-500">
                    Verified professionals visit your site to assess and provide quotes.
                  </Text>
                </View>
                <View className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 self-start">
                  <Text className="text-[10px] font-bold text-emerald-700">Free visits</Text>
                </View>
              </View>

              <View className="gap-2 pt-1">
                {[
                  { size: 1, label: "1 Professional", desc: "1 on-site estimate" },
                  { size: 2, label: "2 Professionals", desc: "Compare 2 quotes", badge: "Recommended" },
                  { size: 3, label: "3 Professionals", desc: "Compare 3 quotes for best match" },
                ].map((tier) => {
                  const isSelected = planSize === tier.size;
                  return (
                    <Pressable
                      key={tier.size}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setPlanSize(tier.size)}
                      className={`flex-row items-center justify-between rounded-2xl p-3.5 shadow-2xs ${
                        isSelected
                          ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                          : "border border-slate-200 bg-white active:bg-slate-50"
                      }`}
                    >
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className={`text-sm ${
                              isSelected ? "font-bold text-[#0B1B3D]" : "font-semibold text-slate-800"
                            }`}
                          >
                            {tier.label}
                          </Text>
                          {tier.badge ? (
                            <View className="rounded-full bg-orange-100 px-2 py-0.5">
                              <Text className="text-[10px] font-bold text-[#EA580C]">
                                {tier.badge}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-xs text-slate-500 mt-0.5">{tier.desc}</Text>
                      </View>
                      {isSelected ? (
                        <CheckCircle2 size={20} color="#EA580C" />
                      ) : (
                        <Circle size={20} color="#CBD5E1" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Duplicate Notice */}
            {(duplicates.data ?? []).length > 0 ? (
              <View className="rounded-2xl border border-amber-200 bg-amber-50 p-4 gap-2">
                <View className="flex-row items-center gap-2">
                  <AlertCircle size={18} color="#D97706" />
                  <Text className="text-sm font-bold text-amber-900">
                    Existing Similar Request
                  </Text>
                </View>
                <Text className="text-xs text-amber-800 leading-relaxed">
                  You already have an active request matching this service and location. You can still send this request if you need additional work.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAllowDuplicate(true)}
                  className={`self-start rounded-xl px-3.5 py-1.5 border ${
                    allowDuplicate
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-amber-300 bg-white"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      allowDuplicate ? "text-emerald-700" : "text-amber-900"
                    }`}
                  >
                    {allowDuplicate ? "✓ Confirmed: Send anyway" : "Allow duplicate and send"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Error Message Display */}
            {create.error || submit.error ? (
              <View className="rounded-2xl border border-red-200 bg-red-50 p-3.5">
                <Text className="text-xs font-bold text-red-800">
                  {describeError(create.error ?? submit.error, "mutation").message}
                </Text>
              </View>
            ) : null}

            {/* Reassurance text */}
            <Text className="text-xs text-slate-500 text-center">
              Free. Professionals will review and provide quotes. You have not been charged.
            </Text>

            {/* Send Request Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send request"
              disabled={isSubmitting}
              onPress={send}
              className={`w-full items-center justify-center rounded-xl py-3.5 shadow-2xs ${
                isSubmitting ? "bg-slate-300" : "bg-[#EA580C] active:bg-[#C2410C]"
              }`}
            >
              {isSubmitting ? (
                <View className="flex-row items-center gap-2">
                  <Spinner size="sm" color="#ffffff" />
                  <Text className="text-base font-bold text-white">Sending request…</Text>
                </View>
              ) : (
                <Text className="text-base font-bold text-white">Send request</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
