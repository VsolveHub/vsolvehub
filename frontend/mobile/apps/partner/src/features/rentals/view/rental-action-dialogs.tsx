import { Button, COLOR_TOKENS, Dialog, Text } from "@vsolve/mobile-ui";
import * as ImagePicker from "expo-image-picker";
import { Camera, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, TextInput, View } from "react-native";

import { uploadPartnerDisputePhoto } from "../queries";

export function HandoverPinDialog({
  open,
  onOpenChange,
  equipmentTitle,
  customerName,
  onSubmit,
  isPending,
  serverError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentTitle: string;
  customerName: string;
  onSubmit: (pin: string) => void;
  isPending: boolean;
  serverError: string | null;
}) {
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleConfirm = () => {
    const trimmed = pin.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      setLocalError("Enter the 4-digit handover PIN from the customer.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPin("");
          setLocalError(null);
        }
        onOpenChange(v);
      }}
      title="Confirm Handover"
      description={`Handing over ${equipmentTitle} to ${customerName}`}
    >
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 py-1"
      >
        <Text className="text-xs text-text-secondary leading-relaxed">
          Ask the renter for the 4-digit PIN displayed on their active booking card. This verifies
          that the equipment is in their custody.
        </Text>

        <View className="gap-1.5 items-center my-1">
          <Text className="text-xs font-bold text-navy-900">Customer 4-Digit Handover PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(v) => {
              setPin(v.replace(/\D/g, "").slice(0, 4));
              setLocalError(null);
            }}
            placeholder="0000"
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            keyboardType="number-pad"
            maxLength={4}
            className="w-48 rounded-2xl border-2 border-line bg-canvas p-2.5 text-center text-3xl font-extrabold tracking-widest text-navy-900"
          />
        </View>

        {localError || serverError ? (
          <Text className="text-center text-xs font-semibold text-danger">
            {localError || serverError}
          </Text>
        ) : null}

        <View className="flex-row gap-2 pt-2">
          <Button
            variant="outline"
            disabled={isPending}
            onPress={() => onOpenChange(false)}
            className="flex-1"
          >
            <Text className="font-semibold text-text-secondary">Cancel</Text>
          </Button>
          <Button
            variant="primary"
            disabled={isPending || pin.length !== 4}
            onPress={handleConfirm}
            className="flex-1"
          >
            <Text className="font-bold text-white">
              {isPending ? "Verifying PIN…" : "Verify & Handover"}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </Dialog>
  );
}

export function ReturnChoiceDialog({
  open,
  onOpenChange,
  equipmentTitle,
  onReleaseFull,
  onOpenDispute,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentTitle: string;
  onReleaseFull: () => void;
  onOpenDispute: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Equipment Returned"
      description={`Return confirmed for ${equipmentTitle}. Choose deposit disposition:`}
    >
      <View className="gap-4 py-2">
        <Text className="text-xs text-text-secondary leading-relaxed">
          If the equipment is intact and operational with all accessories returned, release 100% of
          the security deposit. If items are damaged, missing, or require penalties, submit a damage
          claim.
        </Text>

        <View className="gap-2.5 pt-2">
          <Button
            variant="primary"
            onPress={() => {
              onOpenChange(false);
              onReleaseFull();
            }}
            className="w-full py-3"
          >
            <Text className="font-bold text-white">Release Full Deposit (100% Intact)</Text>
          </Button>

          <Button
            variant="outline"
            onPress={() => {
              onOpenChange(false);
              onOpenDispute();
            }}
            className="w-full py-3 border-danger/40"
          >
            <Text className="font-bold text-danger">Raise Deposit Dispute / Claim Damage</Text>
          </Button>
        </View>
      </View>
    </Dialog>
  );
}

export function DisputeDialog({
  open,
  onOpenChange,
  equipmentTitle,
  maxDepositPaise,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentTitle: string;
  maxDepositPaise: number;
  onSubmit: (reason: string, consumePaise: number, photoIds: string[]) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [consumeRupees, setConsumeRupees] = useState("");
  const [photos, setPhotos] = useState<{ uri: string; uploadId?: string; isUploading?: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const maxRupees = Math.round(maxDepositPaise / 100);

  const pickImage = async () => {
    if (photos.length >= 5) {
      setError("Maximum 5 dispute photos allowed.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Gallery permission is required to attach damage photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    const remaining = 5 - photos.length;
    const assets = result.assets.slice(0, remaining);

    for (const asset of assets) {
      const tempItem = { uri: asset.uri, isUploading: true };
      setPhotos((prev) => [...prev, tempItem]);
      try {
        const upload = await uploadPartnerDisputePhoto(asset.uri, asset.fileName || "dispute.jpg");
        setPhotos((prev) =>
          prev.map((p) =>
            p.uri === asset.uri ? { ...p, uploadId: upload.upload_id, isUploading: false } : p
          )
        );
      } catch (err: unknown) {
        setPhotos((prev) => prev.filter((p) => p.uri !== asset.uri));
        setError(err instanceof Error ? err.message : "Failed to upload photo. Please retry.");
      }
    }
  };

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError("Please describe the damage or missing parts.");
      return;
    }
    let consumePaise = 0;
    if (consumeRupees.trim()) {
      const rupees = Number(consumeRupees.trim());
      if (isNaN(rupees) || rupees < 0) {
        setError("Enter a valid amount in rupees.");
        return;
      }
      if (rupees > maxRupees) {
        setError(`Amount cannot exceed the total security deposit (₹${maxRupees}).`);
        return;
      }
      consumePaise = Math.round(rupees * 100);
    }
    const uploadedIds = photos.map((p) => p.uploadId).filter((id): id is string => Boolean(id));
    setError(null);
    onSubmit(reason.trim(), consumePaise, uploadedIds);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setReason("");
          setConsumeRupees("");
          setPhotos([]);
          setError(null);
        }
        onOpenChange(v);
      }}
      title="Deposit Dispute Claim"
      description={`Claim penalty or damage compensation for ${equipmentTitle}`}
    >
      <ScrollView className="max-h-[75vh] gap-3 py-2" showsVerticalScrollIndicator={false}>
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Reason for Dispute *</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Describe scratches, broken parts, missing cords, late fees..."
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            multiline
            numberOfLines={3}
            className="rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
          />
        </View>

        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">
            Deduction Amount (₹) (Max ₹{maxRupees})
          </Text>
          <TextInput
            value={consumeRupees}
            onChangeText={setConsumeRupees}
            placeholder={`e.g. ${Math.min(500, maxRupees)}`}
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            keyboardType="numeric"
            className="rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
          />
          <Text className="text-[10px] text-text-muted">
            Leave blank or 0 to hold deposit pending operations mediation.
          </Text>
        </View>

        {/* Photo Evidence Picker */}
        <View className="gap-1.5 pt-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-navy-900">
              Damage Photos ({photos.length}/5)
            </Text>
            {photos.length < 5 ? (
              <Pressable
                onPress={pickImage}
                className="flex-row items-center gap-1 rounded-lg bg-surface-muted px-2.5 py-1"
              >
                <Camera size={13} color={COLOR_TOKENS.text} />
                <Text className="text-xs font-semibold text-navy-900">Add Photo</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2 py-1">
            {photos.map((item, idx) => (
              <View key={item.uri} className="relative h-16 w-16 overflow-hidden rounded-xl border border-line bg-canvas">
                <Image source={{ uri: item.uri }} className="h-full w-full" resizeMode="cover" />
                {item.isUploading ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <ActivityIndicator size="small" color={COLOR_TOKENS.textInverse} />
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-black/60"
                >
                  <X size={10} color={COLOR_TOKENS.textInverse} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>

        {error ? <Text className="text-xs font-semibold text-danger">{error}</Text> : null}

        <View className="flex-row gap-2 pt-2">
          <Button
            variant="outline"
            disabled={isPending}
            onPress={() => onOpenChange(false)}
            className="flex-1"
          >
            <Text className="font-semibold text-text-secondary">Cancel</Text>
          </Button>
          <Button
            variant="primary"
            disabled={isPending || photos.some((p) => p.isUploading)}
            onPress={handleConfirm}
            className="flex-1"
          >
            <Text className="font-bold text-white">
              {isPending ? "Submitting…" : "Submit Claim"}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </Dialog>
  );
}

export function PartnerCancelDialog({
  open,
  onOpenChange,
  equipmentTitle,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipmentTitle: string;
  onSubmit: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError("Please provide a reason for cancelling this reservation.");
      return;
    }
    setError(null);
    onSubmit(reason.trim());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setReason("");
          setError(null);
        }
        onOpenChange(v);
      }}
      title="Cancel Reservation"
      description={`Cancel rental booking for ${equipmentTitle}`}
    >
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-3 py-1"
      >
        <Text className="text-xs text-text-secondary leading-relaxed">
          Pre-handover cancellations will automatically refund any payments collected from the
          customer.
        </Text>

        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Cancellation Reason *</Text>
          <TextInput
            value={reason}
            onChangeText={(text) => {
              setReason(text);
              if (error) setError(null);
            }}
            placeholder="e.g. Equipment undergoing maintenance, owner unavailable..."
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            multiline
            numberOfLines={2}
            className="rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
          />
        </View>

        {error ? <Text className="text-xs font-semibold text-danger">{error}</Text> : null}

        <View className="flex-row gap-2 pt-2">
          <Button
            variant="outline"
            disabled={isPending}
            onPress={() => onOpenChange(false)}
            className="flex-1"
          >
            <Text className="font-semibold text-text-secondary">Keep Booking</Text>
          </Button>
          <Button
            variant="danger"
            disabled={isPending}
            onPress={handleConfirm}
            className="flex-1"
          >
            <Text className="font-bold text-white">
              {isPending ? "Cancelling…" : "Confirm Cancel"}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </Dialog>
  );
}
