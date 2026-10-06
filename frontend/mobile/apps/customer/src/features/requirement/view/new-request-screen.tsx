// Ported from frontend/apps/customer/features/requirement/view/requirement-flow.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Input, Spinner, Text } from "@vsolve/mobile-ui";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useAddresses } from "@/features/addresses/queries";
import { useServiceDetail } from "@/features/catalog/client-queries";
import {
  useCreateRequirement,
  useProbableDuplicates,
  useSaveRequirement,
  useSubmitRequirement,
} from "@/features/requirement/queries";

const PHOTO_LIMIT = 6;

export function NewRequestScreen({ serviceSlug }: { serviceSlug: string }) {
  const service = useServiceDetail(serviceSlug);
  const params = useLocalSearchParams<{ selected_service?: string }>();
  const variant = service.data?.requirement_variants[0];
  const variantId = variant?.id ?? service.data?.bookable_variant_id ?? null;
  const questions = variant?.questions ?? [];
  if (service.isPending) return <Spinner size="sm" />;
  if (questions.length === 0) {
    return <SimpleRequest serviceName={service.data?.name ?? "Request"} variantId={variantId} />;
  }
  return (
    <QuestionRequest
      serviceName={service.data?.name ?? "Request"}
      variantId={variantId}
      questions={questions}
      selectedService={params.selected_service}
    />
  );
}

function SimpleRequest({ serviceName, variantId }: { serviceName: string; variantId: string | null }) {
  const create = useCreateRequirement();
  const save = useSaveRequirement();
  const submit = useSubmitRequirement();
  const router = useRouter();
  const [details, setDetails] = useState("");

  function send() {
    if (!variantId) return;
    create.mutate(
      { variantId, answers: { details }, language: "en" },
      {
        onSuccess: (draft) => {
          save.mutate(
            { requirementId: draft.id, additionalDetails: details },
            {
              onSuccess: () =>
                submit.mutate(
                  { requirementId: draft.id, allowDuplicate: false },
                  { onSuccess: () => router.replace(`/requests/${draft.id}` as never) },
                ),
            },
          );
        },
      },
    );
  }

  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">{serviceName}</Text>
      <Text className="text-sm text-text-secondary">Tell us what you need. Professionals quote from this.</Text>
      <Input value={details} onChangeText={setDetails} placeholder="What needs doing" />
      {create.error ? <Text className="text-sm text-danger-text">{describeError(create.error, "mutation").message}</Text> : null}
      <Button disabled={!variantId || details.trim() === ""} loading={create.isPending || save.isPending || submit.isPending} loadingLabel="Sending" onPress={send}>
        Send request
      </Button>
    </View>
  );
}

function QuestionRequest({
  serviceName,
  variantId,
  questions,
  selectedService,
}: {
  serviceName: string;
  variantId: string | null;
  questions: NonNullable<ReturnType<typeof useServiceDetail>["data"]>["requirement_variants"][number]["questions"];
  selectedService?: string;
}) {
  const create = useCreateRequirement();
  const save = useSaveRequirement();
  const submit = useSubmitRequirement();
  const addresses = useAddresses();
  const router = useRouter();
  const [step, setStep] = useState<"what" | "where" | "send">("what");
  const [answers, setAnswers] = useState<Record<string, string>>(selectedService ? { selected_service: selectedService } : {});
  const [addressId, setAddressId] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const duplicates = useProbableDuplicates(
    addressId && when && variantId ? { addressId, requestedStart: when, variantId } : null,
  );

  function setAnswer(code: string, value: string) {
    setAnswers((current) => ({ ...current, [code]: value }));
  }

  async function addPhoto() {
    if (photos.length >= PHOTO_LIMIT) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setPhotos((current) => [...current, asset.fileName ?? "photo.jpg"]);
  }

  function send() {
    if (!variantId || !addressId) return;
    const photoNote = photos.length > 0 ? `Photos: ${photos.join(", ")}` : "";
    create.mutate(
      { variantId, answers, language: "en" },
      {
        onSuccess: (draft) => {
          save.mutate(
            { requirementId: draft.id, addressId, requestedStart: when || undefined, additionalDetails: photoNote || undefined },
            {
              onSuccess: () =>
                submit.mutate(
                  { requirementId: draft.id, allowDuplicate },
                  { onSuccess: () => router.replace(`/requests/${draft.id}` as never) },
                ),
            },
          );
        },
      },
    );
  }

  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">{serviceName}</Text>
      <Text className="text-sm text-text-secondary">
        {step === "what" ? "Step 1 of 3 — What needs doing?" : step === "where" ? "Step 2 of 3 — Where and when?" : "Step 3 of 3 — Choose visits and send"}
      </Text>
      {step === "what"
        ? questions.map((question) => (
            <View key={question.id} className="gap-2">
              <Text className="text-sm font-semibold text-text">{question.prompt}</Text>
              {question.kind === "TEXT" || question.kind === "NUMBER" ? (
                <Input
                  value={answers[question.code] ?? ""}
                  onChangeText={(value) => setAnswer(question.code, value)}
                  keyboardType={question.kind === "NUMBER" ? "number-pad" : "default"}
                  placeholder={question.help_text || question.prompt}
                />
              ) : null}
              {question.kind === "BOOLEAN" ? (
                <View className="flex-row gap-2">
                  {["Yes", "No"].map((choice) => (
                    <Pressable key={choice} onPress={() => setAnswer(question.code, choice)} className="rounded-full border border-line px-3 py-2">
                      <Text className="text-sm font-semibold text-text">{choice}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {question.kind === "SINGLE_CHOICE" || question.kind === "MULTIPLE_CHOICE"
                ? question.options.map((option) => (
                    <Pressable key={option.id} onPress={() => setAnswer(question.code, option.code)} className="rounded-card border border-line px-3 py-2">
                      <Text className="text-sm text-text">{option.label}</Text>
                    </Pressable>
                  ))
                : null}
            </View>
          ))
        : null}
      {step === "where" ? (
        <>
          {(addresses.data ?? []).map((address) => (
            <Pressable key={address.id} onPress={() => setAddressId(address.id)} className="rounded-card border border-line px-4 py-3">
              <Text className="text-base font-semibold text-text">{address.label}</Text>
              <Text className="text-sm text-text-secondary">{address.line1}</Text>
            </Pressable>
          ))}
          <Input value={when} onChangeText={setWhen} placeholder="When, 2026-10-02T09:00:00+05:30" />
          <Button variant="secondary" onPress={() => void addPhoto()}>
            {`Add a photo (${photos.length}/${PHOTO_LIMIT})`}
          </Button>
        </>
      ) : null}
      {step === "send" ? (
        <>
          {(duplicates.data ?? []).length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm text-text">This looks like a request you already sent.</Text>
              <Button variant="secondary" onPress={() => setAllowDuplicate(true)}>
                Send it anyway
              </Button>
            </View>
          ) : null}
          {photos.map((name) => (
            <Text key={name} className="text-sm text-text-secondary">
              {name}
            </Text>
          ))}
        </>
      ) : null}
      {create.error || submit.error ? (
        <Text className="text-sm text-danger-text">{describeError(create.error ?? submit.error, "mutation").message}</Text>
      ) : null}
      {step !== "send" ? (
        <Button onPress={() => setStep(step === "what" ? "where" : "send")}>Continue</Button>
      ) : (
        <Button loading={create.isPending || save.isPending || submit.isPending} loadingLabel="Sending" onPress={send}>
          Send request
        </Button>
      )}
    </View>
  );
}
