import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  AlertCircle,
  ImagePlus,
  Star,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { MAX_REVIEW_PHOTOS } from "../model";
import { submitStayReview, uploadStayReviewPhoto } from "../queries";
import { THEME_COLORS } from "../theme-colors";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const PHOTO_TOO_LARGE = "Each photo must be under 10 MB.";

export function StayReviewSheet({
  propertyId,
  open,
  onOpenChange,
  onSuccess,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      submitStayReview({
        property_id: propertyId,
        rating,
        comment,
        image_urls: photos,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stay-property"],
      });
      setComment("");
      setPhotos([]);
      setRating(5);
      setError(null);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to submit review.");
    },
  });

  const handlePickPhotos = async () => {
    setError(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Permission to access photo gallery is required.");
        return;
      }

      const remainingSlots = MAX_REVIEW_PHOTOS - photos.length;
      if (remainingSlots <= 0) {
        setError(`You can add up to ${MAX_REVIEW_PHOTOS} photos.`);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const validAssets = result.assets.filter(
        (asset) => (asset.fileSize ?? 0) <= MAX_PHOTO_BYTES,
      );

      if (validAssets.length < result.assets.length) {
        setError(PHOTO_TOO_LARGE);
      }

      const toUpload = validAssets.slice(0, remainingSlots);
      if (toUpload.length === 0) return;

      setUploading(true);
      for (const asset of toUpload) {
        try {
          const res = await uploadStayReviewPhoto(asset.uri, asset.fileName || "review.jpg");
          if (res.url) {
            setPhotos((curr) => [...curr, res.url]);
          }
        } catch (uploadErr: any) {
          setError(uploadErr?.message || "Could not upload photo.");
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to select photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (urlToRemove: string) => {
    setPhotos((curr) => curr.filter((u) => u !== urlToRemove));
  };

  const handleSubmit = () => {
    setError(null);
    if (!comment.trim()) {
      setError("Please write a brief comment describing your stay.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Review This Stay"
      description="Tell other guests how your stay went."
    >
      <ScrollView
        className="max-h-[80vh] gap-4 py-2"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
            <AlertCircle size={16} color={THEME_COLORS.red600} />
            <Text className="flex-1 text-xs font-medium text-danger">{error}</Text>
          </View>
        ) : null}

        {/* Rating Stars */}
        <View className="gap-1.5">
          <Text className="text-xs font-bold text-navy-900">Your Rating</Text>
          <View className="flex-row items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${star} stars`}
                onPress={() => setRating(star)}
                className="p-1 active:scale-110"
              >
                <Star
                  size={28}
                  color={THEME_COLORS.amber}
                  fill={star <= rating ? THEME_COLORS.amber : "transparent"}
                />
              </Pressable>
            ))}
            <Text className="ml-2 text-xs font-bold text-text-secondary">
              {rating} of 5 Stars
            </Text>
          </View>
        </View>

        {/* Comment Textarea */}
        <View className="gap-1.5">
          <Text className="text-xs font-bold text-navy-900">Your Comments</Text>
          <TextInput
            placeholder="Tell other guests about the cleanliness, host communication, room condition, and amenities..."
            placeholderTextColor="rgba(107,101,96,0.6)"
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Photos Picker */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-navy-900">
              Photos (optional)
            </Text>
            <Text className="text-[10px] text-text-muted">
              Up to {MAX_REVIEW_PHOTOS} photos (max 10MB)
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-2.5">
            {photos.map((url) => (
              <View
                key={url}
                className="relative size-16 overflow-hidden rounded-xl border border-line"
              >
                <Image
                  source={{ uri: url }}
                  contentFit="cover"
                  style={{ width: "100%", height: "100%" }}
                />
                <Pressable
                  onPress={() => handleRemovePhoto(url)}
                  className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-navy-950/70"
                >
                  <X size={12} color={THEME_COLORS.white} />
                </Pressable>
              </View>
            ))}

            {photos.length < MAX_REVIEW_PHOTOS ? (
              <Pressable
                disabled={uploading}
                onPress={handlePickPhotos}
                className="size-16 items-center justify-center rounded-xl border-2 border-dashed border-line active:border-brand"
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={THEME_COLORS.action} />
                ) : (
                  <View className="items-center gap-1">
                    <ImagePlus size={16} color={THEME_COLORS.muted} />
                    <Text className="text-[9px] font-bold text-text-muted">Add</Text>
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Actions */}
        <View className="flex-row gap-2 pt-2">
          <Button
            size="md"
            variant="secondary"
            onPress={() => onOpenChange(false)}
            className="flex-1 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={mutation.isPending || uploading}
            onPress={handleSubmit}
            className="flex-1 rounded-xl"
          >
            {mutation.isPending ? (
              <ActivityIndicator color={THEME_COLORS.white} size="small" />
            ) : (
              "Submit Review"
            )}
          </Button>
        </View>
      </ScrollView>
    </Dialog>
  );
}
