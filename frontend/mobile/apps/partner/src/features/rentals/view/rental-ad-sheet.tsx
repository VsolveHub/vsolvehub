import { Button, COLOR_TOKENS, Dialog, QuantityStepper, Text } from "@vsolve/mobile-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Camera, Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, TextInput, View } from "react-native";

import { isApiRequestError } from "@vsolve/api-client";
import type { AssetSchema, PartnerRentalAsset } from "../model";
import {
  createPartnerRentalAsset,
  deletePartnerRentalAsset,
  deletePartnerRentalAssetMedia,
  fetchPartnerDefaultLocation,
  fetchRentalTaxonomy,
  updatePartnerRentalAsset,
  uploadPartnerRentalPhoto,
} from "../queries";

const MAX_PHOTOS = 8;

type PhotoDraft = {
  localUri: string;
  remoteUrl?: string;
  mediaId?: string;
  uploading: boolean;
  error?: string;
};

export function RentalAdSheet({
  open,
  onOpenChange,
  editingAsset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAsset?: PartnerRentalAsset | null;
}) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [dailyRateRupees, setDailyRateRupees] = useState("");
  const [depositRupees, setDepositRupees] = useState("");
  const [depositOverridden, setDepositOverridden] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [locationText, setLocationText] = useState("");
  const [description, setDescription] = useState("");

  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [otherModeFields, setOtherModeFields] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Taxonomy queries
  const taxonomyQuery = useQuery({
    queryKey: ["partner-rentals-taxonomy"],
    queryFn: fetchRentalTaxonomy,
  });

  const subcategories = taxonomyQuery.data ?? [];
  const selectedSubcategory = subcategories.find((s) => s.slug === selectedSubcategorySlug);
  const services = selectedSubcategory?.services ?? [];
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const variants = selectedService?.variants ?? [];
  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  const assetSchema: AssetSchema = (selectedVariant?.asset_schema as AssetSchema) ?? {};
  const schemaProps = assetSchema?.properties ?? {};
  const schemaKeys = Object.keys(schemaProps);
  const requiredSchemaKeys = new Set(Array.isArray(assetSchema?.required) ? assetSchema.required : []);

  // React 19 State Adjustment during render when editingAsset changes
  const [prevEditingAssetId, setPrevEditingAssetId] = useState<string | null | undefined>(
    editingAsset?.id,
  );
  if (editingAsset?.id !== prevEditingAssetId) {
    setPrevEditingAssetId(editingAsset?.id);
    if (editingAsset) {
      setTitle(editingAsset.title || "");
      setDailyRateRupees(String(Math.round((editingAsset.daily_rate_paise || 0) / 100)));
      setDepositRupees(String(Math.round((editingAsset.deposit_paise || 0) / 100)));
      setDepositOverridden(true);
      setQuantity(editingAsset.quantity_available || 1);
      setLocationText(editingAsset.location_text || "");
      setDescription(editingAsset.description || "");
      setSelectedVariantId(editingAsset.variant_id || "");
      setStructuredFields((editingAsset.structured_fields as Record<string, string>) || {});

      const existingMedia = editingAsset.media || [];
      const mediaPhotos: PhotoDraft[] = existingMedia.map((m) => ({
        localUri: m.url,
        remoteUrl: m.url,
        mediaId: m.id,
        uploading: false,
      }));
      const fallbackUrls = (editingAsset.image_urls || []).filter(
        (url) => !mediaPhotos.some((m) => m.remoteUrl === url),
      );
      setPhotos([
        ...mediaPhotos,
        ...fallbackUrls.map((url) => ({ localUri: url, remoteUrl: url, uploading: false })),
      ]);
      setRemovedMediaIds([]);
      setOtherModeFields({});
      setFormError(null);
    } else {
      setTitle("");
      setDailyRateRupees("");
      setDepositRupees("");
      setDepositOverridden(false);
      setQuantity(1);
      setDescription("");
      setSelectedSubcategorySlug("");
      setSelectedServiceId("");
      setSelectedVariantId("");
      setPhotos([]);
      setRemovedMediaIds([]);
      setOtherModeFields({});
      setStructuredFields({});
      setFormError(null);
    }
  }

  // Update default deposit from variant when variant changes
  const [prevVariantId, setPrevVariantId] = useState<string | null>(null);
  if (selectedVariantId !== prevVariantId) {
    setPrevVariantId(selectedVariantId);
    if (!depositOverridden && selectedVariant?.default_deposit_paise != null) {
      setDepositRupees(String(Math.round(selectedVariant.default_deposit_paise / 100)));
    }
  }

  // Load default location if empty on open
  useEffect(() => {
    if (open && !editingAsset && !locationText) {
      void fetchPartnerDefaultLocation().then((loc) => {
        if (loc) setLocationText(loc);
      });
    }
  }, [open, editingAsset, locationText]);

  // W-087: Unsaved changes dirty checker
  const isDirty = () => {
    if (editingAsset) {
      const origTitle = editingAsset.title || "";
      const origDailyRate = String(Math.round((editingAsset.daily_rate_paise || 0) / 100));
      const origDeposit = String(Math.round((editingAsset.deposit_paise || 0) / 100));
      const origQty = editingAsset.quantity_available || 1;
      const origLocation = editingAsset.location_text || "";
      const origDesc = editingAsset.description || "";
      return (
        title !== origTitle ||
        dailyRateRupees !== origDailyRate ||
        depositRupees !== origDeposit ||
        quantity !== origQty ||
        locationText !== origLocation ||
        description !== origDesc ||
        removedMediaIds.length > 0 ||
        photos.some((p) => !p.mediaId)
      );
    }
    return Boolean(
      title.trim() ||
        dailyRateRupees.trim() ||
        description.trim() ||
        photos.length > 0 ||
        selectedSubcategorySlug ||
        selectedServiceId ||
        selectedVariantId,
    );
  };

  const handleDismiss = () => {
    if (isDirty()) {
      Alert.alert(
        "Discard unsaved changes?",
        "You have unsaved changes. Are you sure you want to close without saving?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => onOpenChange(false),
          },
        ],
      );
    } else {
      onOpenChange(false);
    }
  };

  const pickPhotos = async () => {
    if (photos.length >= MAX_PHOTOS) {
      setFormError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Please allow gallery access to upload equipment photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    const remaining = MAX_PHOTOS - photos.length;
    const chosen = result.assets.slice(0, remaining);

    const newDrafts: PhotoDraft[] = chosen.map((file) => ({
      localUri: file.uri,
      uploading: true,
    }));
    setPhotos((curr) => [...curr, ...newDrafts]);
    setFormError(null);

    await Promise.all(
      chosen.map(async (file) => {
        try {
          const uploaded = await uploadPartnerRentalPhoto(file.uri, file.fileName || "photo.jpg");
          setPhotos((curr) =>
            curr.map((p) =>
              p.localUri === file.uri
                ? { ...p, remoteUrl: uploaded.url, uploading: false, error: undefined }
                : p,
            ),
          );
        } catch {
          setPhotos((curr) =>
            curr.map((p) =>
              p.localUri === file.uri
                ? { ...p, uploading: false, error: "Upload failed" }
                : p,
            ),
          );
        }
      }),
    );
  };

  // W-076: Track removed media IDs for server deletion
  const removePhoto = (index: number) => {
    const photo = photos[index];
    if (photo?.mediaId) {
      setRemovedMediaIds((curr) => [...curr, photo.mediaId!]);
    }
    setPhotos((curr) => curr.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const dailyPaise = Math.round(Number(dailyRateRupees) * 100);
      const depositPaise = Math.round(Number(depositRupees) * 100);
      const imageUrls = photos.map((p) => p.remoteUrl).filter((url): url is string => Boolean(url));

      const payload = {
        title: title.trim(),
        daily_rate_paise: dailyPaise,
        deposit_paise: depositPaise,
        quantity_available: quantity,
        location_text: locationText.trim(),
        description: description.trim(),
        variant_id: selectedVariantId || undefined,
        structured_fields: structuredFields,
        image_urls: imageUrls,
      };

      if (editingAsset) {
        // W-076: Delete removed media entities on the server
        for (const mediaId of removedMediaIds) {
          try {
            await deletePartnerRentalAssetMedia(editingAsset.id, mediaId);
          } catch (err: unknown) {
            // Treat 404 (already deleted) as success; re-throw any other error
            if (isApiRequestError(err) && err.status === 404) {
              continue;
            }
            throw err;
          }
        }
        return updatePartnerRentalAsset(editingAsset.id, payload);
      }
      return createPartnerRentalAsset(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["partner-rental-assets"] });
      onOpenChange(false);
      Alert.alert(
        "Success",
        editingAsset
          ? "Rental ad updated successfully."
          : "Rental ad created as Draft. Submit it for review to publish.",
      );
    },
    onError: (err: Error) => {
      setFormError(err?.message || "Failed to save rental ad. Please check all fields.");
    },
  });

  // W-081: Delete listing mutation & action
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editingAsset) return;
      await deletePartnerRentalAsset(editingAsset.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["partner-rental-assets"] });
      onOpenChange(false);
      Alert.alert("Deleted", "Rental equipment listing was removed.");
    },
    onError: (err: Error) => {
      Alert.alert("Error", err?.message || "Failed to delete equipment ad.");
    },
  });

  const handleDeleteListing = () => {
    Alert.alert(
      "Delete Equipment Listing?",
      "Are you sure you want to delete this equipment listing? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setFormError("Add a title for your rental equipment.");
      return;
    }
    const rate = Number(dailyRateRupees);
    if (isNaN(rate) || rate <= 0) {
      setFormError("Enter a valid daily rental rate in rupees.");
      return;
    }
    const dep = Number(depositRupees);
    if (isNaN(dep) || dep < 0) {
      setFormError("Enter a valid security deposit in rupees.");
      return;
    }
    if (!locationText.trim()) {
      setFormError("Add the pickup location address for this ad.");
      return;
    }
    if (photos.some((p) => p.uploading)) {
      setFormError("Wait for all photos to finish uploading.");
      return;
    }
    if (photos.some((p) => p.error)) {
      setFormError("Remove failed photos and try uploading again.");
      return;
    }
    if (photos.length < 1) {
      setFormError("Add at least one photo for your equipment.");
      return;
    }
    setFormError(null);
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleDismiss();
        } else {
          onOpenChange(true);
        }
      }}
      title={editingAsset ? "Edit Rental Ad" : "Post Rental Equipment"}
      description="Offer tools & machinery to verified customers"
    >
      <ScrollView className="max-h-[80vh] gap-4 py-2" showsVerticalScrollIndicator={false}>
        {formError ? (
          <View className="rounded-xl bg-danger/10 p-3">
            <Text className="text-xs font-semibold text-danger">{formError}</Text>
          </View>
        ) : null}

        {/* Taxonomy Picker (Only in create mode) */}
        {!editingAsset ? (
          <View className="gap-3 rounded-2xl border border-line bg-canvas p-3.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Category & Equipment Type
            </Text>

            {taxonomyQuery.isPending ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color={COLOR_TOKENS.brand} />
                <Text className="mt-2 text-[11px] text-text-muted">Loading categories...</Text>
              </View>
            ) : taxonomyQuery.isError ? (
              <View className="py-3 items-center gap-2 rounded-xl bg-danger/5 p-3">
                <Text className="text-xs font-semibold text-danger">Failed to load equipment categories.</Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => void taxonomyQuery.refetch()}
                >
                  <Text className="text-xs font-medium text-navy-900">Retry</Text>
                </Button>
              </View>
            ) : (
              <>
                {/* Level 1: Subcategories */}
                <View className="gap-1">
                  <Text className="text-xs font-semibold text-navy-900">Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 py-1">
                    {subcategories.map((sub) => (
                      <Pressable
                        key={sub.id || sub.slug}
                        onPress={() => {
                          setSelectedSubcategorySlug(sub.slug);
                          setSelectedServiceId("");
                          setSelectedVariantId("");
                        }}
                        className={`rounded-xl px-3 py-1.5 border ${
                          selectedSubcategorySlug === sub.slug
                            ? "border-navy-900 bg-navy-900"
                            : "border-line bg-surface active:bg-surface-hover"
                        }`}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            selectedSubcategorySlug === sub.slug ? "text-white" : "text-text-secondary"
                          }`}
                        >
                          {sub.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Level 2: Services */}
                {services.length > 0 ? (
                  <View className="gap-1">
                    <Text className="text-xs font-semibold text-navy-900">Tool Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 py-1">
                      {services.map((svc) => (
                        <Pressable
                          key={svc.id}
                          onPress={() => {
                            setSelectedServiceId(svc.id);
                            setSelectedVariantId("");
                          }}
                          className={`rounded-xl px-3 py-1.5 border ${
                            selectedServiceId === svc.id
                              ? "border-brand bg-brand"
                              : "border-line bg-surface active:bg-surface-hover"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              selectedServiceId === svc.id ? "text-white" : "text-text-secondary"
                            }`}
                          >
                            {svc.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Level 3: Variants */}
                {variants.length > 0 ? (
                  <View className="gap-1">
                    <Text className="text-xs font-semibold text-navy-900">Equipment Variant</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 py-1">
                      {variants.map((v) => (
                        <Pressable
                          key={v.id}
                          onPress={() => setSelectedVariantId(v.id)}
                          className={`rounded-xl px-3 py-1.5 border ${
                            selectedVariantId === v.id
                              ? "border-navy-900 bg-navy-900"
                              : "border-line bg-surface active:bg-surface-hover"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              selectedVariantId === v.id ? "text-white" : "text-text-secondary"
                            }`}
                          >
                            {v.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* Title */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Ad Title *</Text>
          <TextInput
            placeholder="e.g. Bosch GBH 2-26 DRE Rotary Hammer Drill"
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            value={title}
            onChangeText={setTitle}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Rates & Deposits */}
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold text-navy-900">Daily Rate (₹) *</Text>
            <TextInput
              placeholder="e.g. 350"
              placeholderTextColor={COLOR_TOKENS.placeholderText}
              keyboardType="numeric"
              value={dailyRateRupees}
              onChangeText={setDailyRateRupees}
              className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
            />
          </View>

          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold text-navy-900">Deposit (₹) *</Text>
            <TextInput
              placeholder="e.g. 1500"
              placeholderTextColor={COLOR_TOKENS.placeholderText}
              keyboardType="numeric"
              value={depositRupees}
              onChangeText={(txt) => {
                setDepositRupees(txt);
                setDepositOverridden(true);
              }}
              className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
            />
          </View>
        </View>

        {/* Quantity Available */}
        <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface p-3">
          <View className="flex-1 mr-2 min-w-0">
            <Text className="text-xs font-bold text-navy-900">Quantity Available</Text>
            <Text className="text-[10px] text-text-muted">Total units in stock ready for rent</Text>
          </View>
          <QuantityStepper
            hideLabel
            size="sm"
            label="Quantity"
            decrementLabel="Decrease quantity"
            incrementLabel="Increase quantity"
            value={quantity}
            min={1}
            max={50}
            onChange={setQuantity}
          />
        </View>

        {/* Location */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Pickup Location Address *</Text>
          <TextInput
            placeholder="e.g. Shop 12, Ameerpet Commercial Complex, Hyderabad"
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            value={locationText}
            onChangeText={setLocationText}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Dynamic Schema Fields from Variant (W-073: supports prop.examples and 'Other…' fallback) */}
        {schemaKeys.length > 0 ? (
          <View className="gap-2.5 rounded-2xl border border-line bg-canvas p-3.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Technical Specifications ({selectedVariant?.name || "Equipment"})
            </Text>

            {schemaKeys.map((key) => {
              const prop = schemaProps[key] ?? {};
              const label = key.replace(/_/g, " ");
              const isRequired = requiredSchemaKeys.has(key);
              const isBoolean = prop.type === "boolean";
              const list = Array.isArray(prop.enum)
                ? prop.enum.map(String)
                : Array.isArray(prop.examples)
                  ? prop.examples.map(String)
                  : null;
              const val = structuredFields[key] ?? "";

              if (list || isBoolean) {
                const options = isBoolean ? ["true", "false"] : list ?? [];
                const isCustom = val !== "" && !options.includes(val);
                const otherSelected = otherModeFields[key] || isCustom;

                return (
                  <View key={key} className="gap-1.5">
                    <Text className="text-xs font-bold capitalize text-navy-900">
                      {label} {isRequired ? "*" : ""}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerClassName="gap-1.5 py-1"
                    >
                      {options.map((opt: string) => {
                        const isSelected = !otherSelected && val === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() => {
                              setOtherModeFields((prev) => ({ ...prev, [key]: false }));
                              setStructuredFields((prev) => ({ ...prev, [key]: opt }));
                            }}
                            className={`rounded-lg px-3 py-1.5 border ${
                              isSelected
                                ? "border-navy-900 bg-navy-900"
                                : "border-line bg-surface active:bg-surface-hover"
                            }`}
                          >
                            <Text
                              className={`text-xs font-medium ${
                                isSelected ? "text-white" : "text-text-secondary"
                              }`}
                            >
                              {isBoolean ? (opt === "true" ? "Yes" : "No") : opt}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {!isBoolean ? (
                        <Pressable
                          onPress={() => {
                            setOtherModeFields((prev) => ({ ...prev, [key]: true }));
                            if (!isCustom) {
                              setStructuredFields((prev) => ({ ...prev, [key]: "" }));
                            }
                          }}
                          className={`rounded-lg px-3 py-1.5 border ${
                            otherSelected
                              ? "border-brand bg-brand"
                              : "border-line bg-surface active:bg-surface-hover"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              otherSelected ? "text-white" : "text-text-secondary"
                            }`}
                          >
                            Other…
                          </Text>
                        </Pressable>
                      ) : null}
                    </ScrollView>

                    {otherSelected ? (
                      <TextInput
                        placeholder={`Type ${label.toLowerCase()}`}
                        placeholderTextColor={COLOR_TOKENS.placeholderText}
                        value={val}
                        onChangeText={(txt) =>
                          setStructuredFields((prev) => ({ ...prev, [key]: txt }))
                        }
                        className="rounded-xl border border-brand/40 bg-surface p-2.5 text-xs text-navy-900"
                      />
                    ) : null}
                  </View>
                );
              }

              return (
                <View key={key} className="gap-1">
                  <Text className="text-xs font-bold capitalize text-navy-900">
                    {label} {isRequired ? "*" : ""}
                  </Text>
                  <TextInput
                    value={val}
                    onChangeText={(txt) => setStructuredFields((prev) => ({ ...prev, [key]: txt }))}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    placeholderTextColor={COLOR_TOKENS.placeholderText}
                    keyboardType={prop.type === "number" ? "numeric" : "default"}
                    className="rounded-xl border border-line bg-surface p-2.5 text-xs text-navy-900"
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Photo Upload Gallery (W-076: handles delete on saved media) */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-navy-900">
              Photos ({photos.length}/{MAX_PHOTOS})
            </Text>
            {photos.length < MAX_PHOTOS ? (
              <Pressable
                onPress={pickPhotos}
                className="flex-row items-center gap-1 rounded-lg bg-surface-muted px-2.5 py-1"
              >
                <Camera size={13} color={COLOR_TOKENS.text} />
                <Text className="text-xs font-semibold text-navy-900">Add Photos</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 py-1">
            {photos.map((item, idx) => (
              <View
                key={item.localUri}
                className="relative h-20 w-20 overflow-hidden rounded-xl border border-line bg-canvas"
              >
                <Image source={{ uri: item.localUri }} className="h-full w-full" resizeMode="cover" />
                {idx === 0 ? (
                  <View className="absolute bottom-0 left-0 right-0 bg-navy-900/80 py-0.5">
                    <Text className="text-center text-[8px] font-bold text-white">Cover</Text>
                  </View>
                ) : null}
                {item.uploading ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <ActivityIndicator size="small" color={COLOR_TOKENS.textInverse} />
                  </View>
                ) : null}
                <Pressable
                  onPress={() => removePhoto(idx)}
                  className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-black/60"
                >
                  <X size={10} color={COLOR_TOKENS.textInverse} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Description */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Condition, accessories included, pickup instructions..."
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            multiline
            numberOfLines={3}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Submit Button */}
        <Button
          variant="primary"
          disabled={mutation.isPending || deleteMutation.isPending || photos.some((p) => p.uploading)}
          onPress={handleSubmit}
          className="mt-2 w-full py-3"
        >
          <Text className="font-bold text-white">
            {mutation.isPending
              ? "Saving Ad…"
              : editingAsset
                ? "Update Rental Ad"
                : "Save & Publish Ad"}
          </Text>
        </Button>

        {/* W-081: Delete Ad Button */}
        {editingAsset ? (
          <Button
            variant="outline"
            disabled={mutation.isPending || deleteMutation.isPending}
            onPress={handleDeleteListing}
            className="mt-1 w-full py-2.5 flex-row items-center justify-center gap-1.5 border-danger/30"
          >
            <Trash2 size={14} color={COLOR_TOKENS.danger} />
            <Text className="text-xs font-bold text-danger">
              {deleteMutation.isPending ? "Deleting…" : "Delete Equipment Listing"}
            </Text>
          </Button>
        ) : null}
      </ScrollView>
    </Dialog>
  );
}
