import { Button, Dialog, QuantityStepper, Text } from "@vsolve/mobile-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Camera, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, TextInput, View } from "react-native";

import type { PartnerRentalAsset } from "../model";
import {
  createPartnerRentalAsset,
  fetchPartnerDefaultLocation,
  fetchRentalTaxonomy,
  updatePartnerRentalAsset,
  uploadPartnerRentalPhoto,
} from "../queries";

const MAX_PHOTOS = 8;

type PhotoDraft = {
  localUri: string;
  remoteUrl?: string;
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
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Taxonomy queries
  const taxonomyQuery = useQuery({
    queryKey: ["partner-rentals-taxonomy"],
    queryFn: fetchRentalTaxonomy,
  });

  const subcategories = (taxonomyQuery.data as any[]) ?? [];
  const selectedSubcategory = subcategories.find((s) => s.slug === selectedSubcategorySlug);
  const services = (selectedSubcategory?.services as any[]) ?? [];
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const variants = (selectedService?.variants as any[]) ?? [];
  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  const assetSchema = (selectedVariant?.asset_schema as Record<string, any>) ?? {};
  const schemaProps = (assetSchema?.properties as Record<string, any>) ?? {};
  const schemaKeys = Object.keys(schemaProps);
  const requiredSchemaKeys = new Set(Array.isArray(assetSchema?.required) ? assetSchema.required : []);

  // Update default deposit from variant when variant changes
  useEffect(() => {
    if (!depositOverridden && selectedVariant?.default_deposit_paise != null) {
      const depVal = String(Math.round(selectedVariant.default_deposit_paise / 100));
      queueMicrotask(() => {
        setDepositRupees(depVal);
      });
    }
  }, [selectedVariant, depositOverridden]);

  // Load default location
  useEffect(() => {
    if (open && !editingAsset) {
      void fetchPartnerDefaultLocation().then((loc) => {
        if (loc) setLocationText((curr) => (curr ? curr : loc));
      });
    }
  }, [open, editingAsset]);

  useEffect(() => {
    if (editingAsset) {
      queueMicrotask(() => {
        setTitle(editingAsset.title || "");
        setDailyRateRupees(String(Math.round((editingAsset.daily_rate_paise || 0) / 100)));
        setDepositRupees(String(Math.round((editingAsset.deposit_paise || 0) / 100)));
        setDepositOverridden(true);
        setQuantity(editingAsset.quantity_available || 1);
        setLocationText(editingAsset.location_text || "");
        setDescription(editingAsset.description || "");
        setSelectedVariantId(editingAsset.variant_id || "");
        setStructuredFields((editingAsset.structured_fields as Record<string, string>) || {});

        const existingUrls = editingAsset.image_urls || editingAsset.media?.map((m) => m.url) || [];
        setPhotos(existingUrls.map((url) => ({ localUri: url, remoteUrl: url, uploading: false })));
        setFormError(null);
      });
    } else {
      queueMicrotask(() => {
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
        setStructuredFields({});
        setFormError(null);
      });
    }
  }, [editingAsset, open]);

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
                : p
            )
          );
        } catch {
          setPhotos((curr) =>
            curr.map((p) =>
              p.localUri === file.uri
                ? { ...p, uploading: false, error: "Upload failed" }
                : p
            )
          );
        }
      })
    );
  };

  const removePhoto = (index: number) => {
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
        return updatePartnerRentalAsset(editingAsset.id, payload);
      }
      return createPartnerRentalAsset(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["partner-rental-assets"] });
      onOpenChange(false);
      Alert.alert(
        "Success",
        editingAsset ? "Rental ad updated successfully." : "Rental ad created as Draft. Submit it for review to publish.",
      );
    },
    onError: (err: any) => {
      setFormError(err?.message || "Failed to save rental ad. Please check all fields.");
    },
  });

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
    // Check required schema keys
    for (const key of schemaKeys) {
      if (requiredSchemaKeys.has(key) && !structuredFields[key]?.trim()) {
        setFormError(`Please fill in ${key.replace(/_/g, " ")}.`);
        return;
      }
    }
    setFormError(null);
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingAsset ? "Edit Rental Ad" : "Post Rental Equipment"}
      description="Publish certified equipment with daily rates and refundable deposit"
    >
      <ScrollView className="max-h-[80vh] gap-4 py-2" showsVerticalScrollIndicator={false}>
        {formError ? (
          <View className="rounded-xl bg-danger/10 p-3">
            <Text className="text-xs font-semibold text-danger">{formError}</Text>
          </View>
        ) : null}

        {/* Taxonomy Hierarchy Selectors (GAP-R-05) */}
        {!editingAsset && subcategories.length > 0 ? (
          <View className="gap-2 rounded-2xl border border-line bg-canvas p-3.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Equipment Category & Trade *
            </Text>

            {/* Subcategories */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 py-1">
              {subcategories.map((cat: any) => (
                <Pressable
                  key={cat.id || cat.slug}
                  onPress={() => {
                    setSelectedSubcategorySlug(cat.slug);
                    setSelectedServiceId("");
                    setSelectedVariantId("");
                  }}
                  className={`rounded-full px-3 py-1.5 border ${
                    selectedSubcategorySlug === cat.slug
                      ? "border-navy-900 bg-navy-900"
                      : "border-line bg-surface"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selectedSubcategorySlug === cat.slug ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Services */}
            {services.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 pt-1">
                {services.map((svc: any) => (
                  <Pressable
                    key={svc.id || svc.slug}
                    onPress={() => {
                      setSelectedServiceId(svc.id);
                      setSelectedVariantId("");
                    }}
                    className={`rounded-full px-3 py-1.5 border ${
                      selectedServiceId === svc.id
                        ? "border-brand bg-brand/10"
                        : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        selectedServiceId === svc.id ? "text-brand" : "text-text-secondary"
                      }`}
                    >
                      {svc.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {/* Variants */}
            {variants.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 pt-1">
                {variants.map((v: any) => (
                  <Pressable
                    key={v.id}
                    onPress={() => setSelectedVariantId(v.id)}
                    className={`rounded-full px-3 py-1.5 border ${
                      selectedVariantId === v.id
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        selectedVariantId === v.id ? "text-emerald-700" : "text-text-secondary"
                      }`}
                    >
                      {v.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {/* Title */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Equipment Title *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Bosch Professional Rotary Hammer Drill"
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Pricing */}
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold text-navy-900">Daily Rent (₹) *</Text>
            <TextInput
              value={dailyRateRupees}
              onChangeText={setDailyRateRupees}
              placeholder="e.g. 500"
              keyboardType="numeric"
              className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
            />
          </View>

          <View className="flex-1 gap-1">
            <Text className="text-xs font-bold text-navy-900">Security Deposit (₹) *</Text>
            <TextInput
              value={depositRupees}
              onChangeText={(v) => {
                setDepositRupees(v);
                setDepositOverridden(true);
              }}
              placeholder="e.g. 2000"
              keyboardType="numeric"
              className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
            />
          </View>
        </View>

        {/* Quantity */}
        <View className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-3.5">
          <View>
            <Text className="text-xs font-bold text-navy-900">Quantity Available</Text>
            <Text className="text-[10px] text-text-muted">Total identical units for rent</Text>
          </View>
          <QuantityStepper
            label="Quantity"
            decrementLabel="Decrease units"
            incrementLabel="Increase units"
            value={quantity}
            min={1}
            max={50}
            onChange={setQuantity}
          />
        </View>

        {/* Location (Prefilled) */}
        <View className="gap-1">
          <Text className="text-xs font-bold text-navy-900">Pickup Location *</Text>
          <TextInput
            value={locationText}
            onChangeText={setLocationText}
            placeholder="e.g. Plot 42, Hitec City, Hyderabad"
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Dynamic Schema Fields from Variant (GAP-R-05) */}
        {schemaKeys.length > 0 ? (
          <View className="gap-2.5 rounded-2xl border border-line bg-canvas p-3.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Technical Specifications ({selectedVariant?.name || "Equipment"})
            </Text>

            {schemaKeys.map((key) => {
              const prop = schemaProps[key] ?? {};
              const label = key.replace(/_/g, " ");
              const isRequired = requiredSchemaKeys.has(key);
              const enums = Array.isArray(prop.enum) ? prop.enum.map(String) : null;
              const val = structuredFields[key] ?? "";

              if (enums || prop.type === "boolean") {
                const options = enums ?? ["true", "false"];
                return (
                  <View key={key} className="gap-1">
                    <Text className="text-xs font-bold capitalize text-navy-900">
                      {label} {isRequired ? "*" : ""}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-1.5 py-1">
                      {options.map((opt: string) => (
                        <Pressable
                          key={opt}
                          onPress={() => setStructuredFields((prev) => ({ ...prev, [key]: opt }))}
                          className={`rounded-lg px-3 py-1.5 border ${
                            val === opt
                              ? "border-navy-900 bg-navy-900"
                              : "border-line bg-surface"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              val === opt ? "text-white" : "text-text-secondary"
                            }`}
                          >
                            {prop.type === "boolean" ? (opt === "true" ? "Yes" : "No") : opt}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
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
                    keyboardType={prop.type === "number" ? "numeric" : "default"}
                    className="rounded-xl border border-line bg-surface p-2.5 text-xs text-navy-900"
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Photo Upload Gallery (GAP-R-04) */}
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
                <Camera size={13} color="#071328" />
                <Text className="text-xs font-semibold text-navy-900">Add Photos</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2 py-1">
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
                    <ActivityIndicator size="small" color="#ffffff" />
                  </View>
                ) : null}
                <Pressable
                  onPress={() => removePhoto(idx)}
                  className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-black/60"
                >
                  <X size={10} color="#ffffff" />
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
            multiline
            numberOfLines={3}
            className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
          />
        </View>

        {/* Submit */}
        <Button
          variant="primary"
          disabled={mutation.isPending || photos.some((p) => p.uploading)}
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
      </ScrollView>
    </Dialog>
  );
}
