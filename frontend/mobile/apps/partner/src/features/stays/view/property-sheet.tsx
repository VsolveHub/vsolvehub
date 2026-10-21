import { Button, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, X } from "lucide-react-native";

import {
  type StayProperty,
  type StayPropertyType,
  stayPropertyTypes,
} from "../model";
import {
  createPartnerStayProperty,
  fetchPartnerDefaultLocation,
  fetchStayTaxonomy,
  updatePartnerStayProperty,
  uploadPartnerStayPhoto,
} from "../queries";
import { THEME_COLORS } from "../theme-colors";

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const TENANT_PREFERENCES = [
  { value: "ANY", label: "Anyone" },
  { value: "BACHELOR_MALE", label: "Bachelor (male)" },
  { value: "BACHELOR_FEMALE", label: "Bachelor (female / ladies)" },
  { value: "FAMILY", label: "Family" },
  { value: "WORKING_PROFESSIONAL", label: "Working professional" },
];

export function PropertySheet({
  open,
  onOpenChange,
  editingProperty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProperty?: StayProperty | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingProperty ? "Edit Stay Details" : "Add a Property"}
      description="List your hostel, co-living space, PG, or serviced apartment."
    >
      {open ? (
        <PropertySheetContent
          key={editingProperty?.id ?? "new"}
          editingProperty={editingProperty}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  );
}

function PropertySheetContent({
  editingProperty,
  onOpenChange,
}: {
  editingProperty?: StayProperty | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();

  // Queries
  const taxonomyQuery = useQuery({
    queryKey: ["stay-taxonomy"],
    queryFn: fetchStayTaxonomy,
  });

  const defaultLocationQuery = useQuery({
    queryKey: ["partner-default-location"],
    queryFn: fetchPartnerDefaultLocation,
    enabled: !editingProperty,
  });

  const isEditing = Boolean(editingProperty);
  const propertyTypes: StayPropertyType[] = stayPropertyTypes(taxonomyQuery.data ?? []);

  // State
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const variantId =
    selectedVariantId ??
    (editingProperty?.variant?.id ?? propertyTypes[0]?.variant.id ?? "");
  const selectedType = propertyTypes.find((t) => t.variant.id === variantId);

  const [title, setTitle] = useState(editingProperty?.title ?? "");

  const [userLocationText, setUserLocationText] = useState<string | null>(null);
  const locationText =
    userLocationText ??
    (editingProperty?.location_text ?? defaultLocationQuery.data ?? "");

  const [description, setDescription] = useState(editingProperty?.description ?? "");
  const [houseRules, setHouseRules] = useState(editingProperty?.house_rules ?? "");
  const [minStay, setMinStay] = useState(
    editingProperty ? String(editingProperty.min_stay_nights || 1) : "1",
  );
  const [tenantPreference, setTenantPreference] = useState(
    typeof editingProperty?.structured_fields?.tenant_preference === "string"
      ? editingProperty.structured_fields.tenant_preference
      : "ANY",
  );

  // Dynamic answers & amenities
  const [schemaAnswers, setSchemaAnswers] = useState<Record<string, string>>(() => {
    const structured = editingProperty?.structured_fields ?? {};
    const ans: Record<string, string> = {};
    for (const [k, v] of Object.entries(structured)) {
      if (typeof v !== "boolean" && v != null) ans[k] = String(v);
    }
    return ans;
  });
  const [amenities, setAmenities] = useState<Record<string, boolean>>(() => {
    const structured = editingProperty?.structured_fields ?? {};
    const am: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(structured)) {
      if (typeof v === "boolean") am[k] = v;
    }
    return am;
  });

  // Photos
  const [photos, setPhotos] = useState<
    { uri: string; remoteUrl?: string; uploading?: boolean }[]
  >(() => {
    const existingMedia = editingProperty?.media ?? [];
    if (existingMedia.length > 0) {
      return existingMedia.map((m) => ({ uri: m.url, remoteUrl: m.url }));
    }
    if (editingProperty?.image_urls?.length) {
      return editingProperty.image_urls.map((u) => ({ uri: u, remoteUrl: u }));
    }
    return [];
  });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stay-properties"] });
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const urls = photos.map((p) => p.remoteUrl).filter((u): u is string => Boolean(u));
      const minStayNum = Number.parseInt(minStay, 10) || 1;

      return createPartnerStayProperty({
        variant_id: variantId || undefined,
        title: title.trim(),
        location_text: locationText.trim(),
        description: description.trim(),
        house_rules: houseRules.trim(),
        min_stay_nights: minStayNum,
        structured_fields: {
          ...schemaAnswers,
          ...amenities,
          ...(tenantPreference !== "ANY" ? { tenant_preference: tenantPreference } : {}),
        },
        image_urls: urls,
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.message || "Failed to create property"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingProperty) throw new Error("No property to edit");
      const urls = photos.map((p) => p.remoteUrl).filter((u): u is string => Boolean(u));
      const minStayNum = Number.parseInt(minStay, 10) || 1;

      return updatePartnerStayProperty(editingProperty.id, {
        title: title.trim(),
        location_text: locationText.trim(),
        description: description.trim(),
        house_rules: houseRules.trim(),
        min_stay_nights: minStayNum,
        structured_fields: {
          ...schemaAnswers,
          ...amenities,
          ...(tenantPreference !== "ANY" ? { tenant_preference: tenantPreference } : {}),
        },
        image_urls: urls,
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.message || "Failed to update property"),
  });

  const handlePickPhotos = async () => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;

    const assets = result.assets.slice(0, remaining);
    setError(null);

    for (const asset of assets) {
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
        setError("Each photo must be 10 MB or smaller.");
        continue;
      }

      const tempId = asset.uri;
      setPhotos((prev) => [...prev, { uri: asset.uri, uploading: true }]);

      try {
        const upload = await uploadPartnerStayPhoto(asset.uri, asset.fileName || "property.jpg");
        setPhotos((prev) =>
          prev.map((p) => (p.uri === tempId ? { uri: asset.uri, remoteUrl: upload.url, uploading: false } : p)),
        );
      } catch (err: any) {
        setPhotos((prev) => prev.filter((p) => p.uri !== tempId));
        setError(err?.message || "Could not upload photo.");
      }
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setError("Give your property a name guests will recognise.");
      return;
    }
    if (!locationText.trim()) {
      setError("Add the property's area and city.");
      return;
    }
    if (photos.some((p) => p.uploading)) {
      setError("Wait for photos to finish uploading.");
      return;
    }

    setError(null);
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const schemaProps = selectedType?.variant?.property_schema?.properties ?? {};
  const amenityOptions = selectedType?.variant?.amenity_options ?? [];

  return (
    <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
      <View className="flex-col gap-4 py-2">
        {/* Property Type / Variant */}
        {!isEditing && propertyTypes.length > 0 ? (
          <View>
            <Text className="text-xs font-semibold text-text">Type of property *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
              <View className="flex-row gap-2">
                {propertyTypes.map((t) => {
                  const isSelected = t.variant.id === variantId;
                  return (
                    <Pressable
                      key={t.variant.id}
                      onPress={() => {
                        setSelectedVariantId(t.variant.id);
                        setSchemaAnswers({});
                        setAmenities({});
                      }}
                      className={`rounded-xl border px-3 py-2 ${
                        isSelected
                          ? "border-navy-900 bg-navy-900"
                          : "border-line bg-surface-muted"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? "text-white" : "text-text"
                        }`}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {/* Title */}
        <View>
          <Text className="text-xs font-semibold text-text">Property name *</Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Lakeview PG for working women"
            className="mt-1.5"
          />
        </View>

        {/* Location */}
        <View>
          <Text className="text-xs font-semibold text-text">Location *</Text>
          <Text className="text-[11px] text-text-muted">Area and city guests search by.</Text>
          <Input
            value={locationText}
            onChangeText={setUserLocationText}
            placeholder="e.g. Madhapur, Hyderabad"
            className="mt-1.5"
          />
        </View>

        {/* Tenant Preference */}
        <View>
          <Text className="text-xs font-semibold text-text">Who can stay here?</Text>
          <Text className="text-[11px] text-text-muted">Helps guests self-filter before enquiring.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
            <View className="flex-row gap-1.5">
              {TENANT_PREFERENCES.map((pref) => {
                const on = tenantPreference === pref.value;
                return (
                  <Pressable
                    key={pref.value}
                    onPress={() => setTenantPreference(pref.value)}
                    className={`rounded-full border px-2.5 py-1 ${
                      on ? "border-navy-900 bg-navy-900" : "border-line bg-surface-muted"
                    }`}
                  >
                    <Text className={`text-xs font-medium ${on ? "text-white" : "text-text"}`}>
                      {pref.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Dynamic Schema Questions */}
        {Object.keys(schemaProps).length > 0 ? (
          <View className="flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
            <Text className="text-xs font-bold text-text">Property Details</Text>
            {Object.entries(schemaProps).map(([key, prop]: [string, any]) => {
              const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const val = schemaAnswers[key] || "";

              if (prop?.enum && Array.isArray(prop.enum)) {
                return (
                  <View key={key} className="mt-1">
                    <Text className="text-[11px] font-semibold text-text">{label}</Text>
                    <View className="flex-row flex-wrap gap-1.5 mt-1">
                      {prop.enum.map((opt: string) => {
                        const on = val === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() =>
                              setSchemaAnswers((prev) => ({ ...prev, [key]: opt }))
                            }
                            className={`rounded-md border px-2 py-1 ${
                              on ? "border-navy-900 bg-navy-900" : "border-line bg-surface"
                            }`}
                          >
                            <Text className={`text-[11px] ${on ? "text-white font-bold" : "text-text"}`}>
                              {opt}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              }

              return (
                <View key={key} className="mt-1">
                  <Text className="text-[11px] font-semibold text-text">{label}</Text>
                  <Input
                    value={val}
                    onChangeText={(t) => setSchemaAnswers((prev) => ({ ...prev, [key]: t }))}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    className="mt-1 h-8 text-xs"
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Amenities Checklist */}
        {amenityOptions.length > 0 ? (
          <View className="flex-col gap-2">
            <Text className="text-xs font-semibold text-text">Amenities & Inclusions</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {amenityOptions.map((opt: { key: string; label: string }) => {
                const checked = Boolean(amenities[opt.key]);
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() =>
                      setAmenities((prev) => ({ ...prev, [opt.key]: !checked }))
                    }
                    className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                      checked ? "border-navy-900 bg-navy-900" : "border-line bg-surface-muted"
                    }`}
                  >
                    {checked ? <Check size={11} color={THEME_COLORS.white} /> : null}
                    <Text className={`text-xs ${checked ? "text-white font-bold" : "text-text"}`}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Photos */}
        <View className="flex-col gap-2">
          <Text className="text-xs font-semibold text-text">Building & common area photos</Text>
          <Text className="text-[11px] text-text-muted">
            Entrance, kitchen, street. Up to {MAX_PHOTOS} photos, 10 MB each.
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {photos.map((p, index) => (
              <View
                key={p.uri}
                className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-muted"
              >
                <Image source={{ uri: p.uri }} className="h-full w-full" resizeMode="cover" />
                {index === 0 ? (
                  <View className="absolute left-1 top-1 rounded bg-navy-900 px-1 py-0.5">
                    <Text className="text-[9px] font-bold text-white uppercase">Cover</Text>
                  </View>
                ) : null}
                {p.uploading ? (
                  <View className="absolute inset-x-0 bottom-0 bg-navy-900/80 py-0.5 items-center">
                    <Text className="text-[9px] text-white">Uploading…</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => handleRemovePhoto(index)}
                  className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-white shadow-xs"
                >
                  <X size={12} color={THEME_COLORS.navy900} />
                </Pressable>
              </View>
            ))}

            {photos.length < MAX_PHOTOS ? (
              <Pressable
                onPress={handlePickPhotos}
                className="h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-line bg-surface-muted"
              >
                <Camera size={20} color={THEME_COLORS.zinc500} />
                <Text className="mt-1 text-[10px] font-semibold text-text-muted">Add photo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Description */}
        <View>
          <Text className="text-xs font-semibold text-text">Description</Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="What makes it a good place to stay — meals, Wi-Fi, what's nearby."
            multiline
            numberOfLines={3}
            className="mt-1.5 min-h-[4.5rem] py-2"
          />
        </View>

        {/* House Rules */}
        <View>
          <Text className="text-xs font-semibold text-text">House rules</Text>
          <Input
            value={houseRules}
            onChangeText={setHouseRules}
            placeholder="Gate time, visitors, smoking, quiet hours."
            multiline
            numberOfLines={2}
            className="mt-1.5 min-h-[3.5rem] py-2"
          />
        </View>

        {/* Minimum stay */}
        <View>
          <Text className="text-xs font-semibold text-text">Minimum stay (nights/months)</Text>
          <Input
            value={minStay}
            onChangeText={setMinStay}
            keyboardType="numeric"
            placeholder="1"
            className="mt-1.5 w-28"
          />
        </View>

        {error ? <Text className="text-xs text-rose-600">{error}</Text> : null}

        {/* Submit */}
        <Button
          variant="primary"
          onPress={handleSubmit}
          disabled={createMutation.isPending || updateMutation.isPending}
          className="mt-2"
        >
          <Text className="font-bold text-white">
            {createMutation.isPending || updateMutation.isPending
              ? "Saving…"
              : isEditing
                ? "Save details"
                : "Save and add rooms"}
          </Text>
        </Button>
      </View>
    </ScrollView>
  );
}
