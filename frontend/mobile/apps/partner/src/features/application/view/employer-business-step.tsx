// Ported from frontend/apps/partner/features/application/view/employer-business-step.tsx
import type { Schemas } from "@vsolve/api-client";
import { getCurrentPosition, PlaceSearch, useReverseGeocode, type ResolvedLocation } from "@vsolve/mobile-core";
import { Badge, Button, ChoiceChips, Field, Input, Select, Text, useT } from "@vsolve/mobile-ui";
import { describeError } from "@vsolve/query/native";
import * as ImagePicker from "expo-image-picker";
import { ImagePlus, MapPin, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Image, View } from "react-native";

import { useApplyDock } from "../model/dock-context";
import {
  CATEGORIES,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  NON_GST_PROOFS,
  SIZES,
  STRUCTURES,
  businessDraft,
  businessPatch,
  businessProblems,
  canContinue,
  gstinProblem,
  isPinCode,
  type BusinessDraft,
  type GstAnswer,
} from "../model/employer-form";
import { useRemoveEmployerLogo, useUpdateEmployerDetails, useUploadEmployerLogo } from "../queries";
import { EmployerFrame, useEmployerNav } from "./employer-frame";
import { EmployerGuard } from "./employer-guard";

type Application = Schemas["PartnerApplication"];

/**
 * "Your business": the names it is shown under, what kind of business it is, whether it has GST, the
 * proof that will be uploaded, where it is (with a pin on the map) and an optional logo and website.
 *
 * Candidates see the trade name (else the legal name), the logo, the industry, the size and the
 * area. The street address and pin code stay with the platform.
 */
export function EmployerBusinessStep() {
  return (
    <EmployerGuard screen="business">
      {(application) => <BusinessForm key={application.version} application={application} />}
    </EmployerGuard>
  );
}

function BusinessForm({ application }: { application: Application }) {
  const t = useT();
  const save = useUpdateEmployerDetails();
  const { goNext } = useEmployerNav(application);
  const { scrollFieldIntoView } = useApplyDock();
  const saved = businessDraft(application.employer?.business);
  const [draft, setDraft] = useState<BusinessDraft>(saved);

  const problems = businessProblems(draft);
  const gstProblem = gstinProblem(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const pinned = draft.latitude !== "" && draft.longitude !== "";
  const change = (patch: Partial<BusinessDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    save.reset();
  };

  function pickGst(answer: GstAnswer) {
    // Yes fixes the proof to the GST certificate; No lets them choose another.
    change({ gst: answer, proof: answer === "yes" ? "GST_CERTIFICATE" : "", gstin: answer === "yes" ? draft.gstin : "" });
  }

  // The pin fills what is still blank; what the employer typed is theirs to keep.
  function onPinned(latitude: string, longitude: string, location: ResolvedLocation | null) {
    setDraft((current) => ({
      ...current,
      latitude,
      longitude,
      address: current.address.trim() ? current.address : (location?.line1 || location?.formatted_address || ""),
      area: current.area.trim() ? current.area : (location?.locality ?? ""),
      city: current.city.trim() ? current.city : (location?.city ?? ""),
      state: current.state.trim() ? current.state : (location?.state ?? ""),
      pinCode:
        current.pinCode.trim() || !location || !isPinCode(location.postal_code ?? "")
          ? current.pinCode
          : (location.postal_code ?? ""),
    }));
    save.reset();
  }

  function onContinue() {
    if (!dirty) {
      goNext();
      return;
    }
    save.mutate(businessPatch(draft), { onSuccess: goNext });
  }

  return (
    <EmployerFrame
      application={application}
      title={t("apply.steps.employerBusiness")}
      description={t("apply.employer.business.description")}
      canContinue={canContinue(problems)}
      saving={save.isPending}
      error={save.error}
      onContinue={onContinue}
    >
      <Field
        label={t("apply.employer.business.tradeName.label")}
        description={t("apply.employer.business.tradeName.description")}
      >
        <Input
          maxLength={120}
          value={draft.tradeName}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ tradeName: value })}
        />
      </Field>

      <Field required label={t("apply.employer.business.legalName.label")}>
        <Input
          autoComplete="organization"
          maxLength={200}
          placeholder={t("apply.employer.business.legalName.placeholder")}
          value={draft.legalName}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ legalName: value })}
        />
      </Field>

      <Field required label={t("apply.employer.business.structure.label")}>
        <ChoiceChips
          label={t("apply.employer.business.structure.label")}
          name="legal_structure"
          options={STRUCTURES.map((code) => ({
            value: code,
            label: t(`apply.employer.business.structure.${code}`),
          }))}
          value={draft.structure || null}
          onChange={(value) => change({ structure: value })}
        />
      </Field>

      <Field required label={t("apply.employer.business.industry.label")}>
        <ChoiceChips
          label={t("apply.employer.business.industry.label")}
          name="business_category"
          options={CATEGORIES.map((code) => ({
            value: code,
            label: t(`apply.employer.category.${code}`),
          }))}
          value={draft.category || null}
          onChange={(value) => change({ category: value })}
        />
      </Field>

      <Field required label={t("apply.employer.business.size.label")}>
        <ChoiceChips
          label={t("apply.employer.business.size.label")}
          name="company_size"
          options={SIZES}
          value={draft.size || null}
          onChange={(value) => change({ size: value })}
        />
      </Field>

      <Field required label={t("apply.employer.business.gst.label")}>
        <ChoiceChips
          label={t("apply.employer.business.gst.label")}
          name="gst"
          layout="bar"
          options={[
            { value: "yes", label: t("apply.employer.business.gst.yes") },
            { value: "no", label: t("apply.employer.business.gst.no") },
          ]}
          value={draft.gst || null}
          onChange={(value) => pickGst(value as GstAnswer)}
        />
      </Field>

      {draft.gst === "yes" ? (
        <Field
          required
          label={t("apply.employer.business.gstin.label")}
          description={t("apply.employer.business.gstin.note")}
          error={gstProblem ? t(`apply.employer.business.gstin.problem.${gstProblem}`) : undefined}
        >
          <Input
            maxLength={15}
            autoCapitalize="characters"
            autoCorrect={false}
            value={draft.gstin}
            onFocus={scrollFieldIntoView}
            onChangeText={(value) => change({ gstin: value.toUpperCase() })}
          />
        </Field>
      ) : null}

      {draft.gst === "yes" ? (
        <Field label={t("apply.employer.business.proof.label")} showOptional={false}>
          <View className="min-h-11 justify-center rounded-control border border-line bg-surface-sunken px-3 py-2.5">
            <Text className="text-sm text-text">{t("apply.employer.business.proof.GST_CERTIFICATE")}</Text>
          </View>
        </Field>
      ) : null}

      {draft.gst === "no" ? (
        <Field required label={t("apply.employer.business.proof.label")}>
          <Select
            placeholder={t("apply.employer.business.proof.placeholder")}
            value={draft.proof}
            options={NON_GST_PROOFS.map((code) => ({
              value: code,
              label: t(`apply.employer.business.proof.${code}`),
            }))}
            onChange={(event) => change({ proof: event.target.value })}
          />
        </Field>
      ) : null}

      <Field required label={t("apply.employer.business.address.label")}>
        <Input
          autoComplete="street-address"
          maxLength={240}
          value={draft.address}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ address: value })}
        />
      </Field>

      <Field required label={t("apply.employer.field.area.label")}>
        <Input
          maxLength={120}
          value={draft.area}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ area: value })}
        />
      </Field>
      <Field required label={t("apply.employer.field.city.label")}>
        <Input
          autoComplete="postal-address-locality"
          maxLength={80}
          value={draft.city}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ city: value })}
        />
      </Field>
      <Field required label={t("apply.employer.field.state.label")}>
        <Input
          autoComplete="postal-address-region"
          maxLength={40}
          value={draft.state}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ state: value })}
        />
      </Field>
      <Field
        required
        label={t("apply.employer.field.pinCode.label")}
        error={problems.invalid.has("pinCode") ? t("apply.employer.field.pinCode.error") : undefined}
      >
        <Input
          keyboardType="number-pad"
          autoComplete="postal-code"
          maxLength={6}
          value={draft.pinCode}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ pinCode: value.replace(/\D/g, "") })}
        />
      </Field>

      <Field required label={t("apply.employer.business.mapPin.label")}>
        <FindOnMap pinned={pinned} onPicked={onPinned} />
        {pinned ? null : (
          <Text className="text-sm text-text-secondary">{t("apply.employer.business.mapPin.required")}</Text>
        )}
      </Field>

      <LogoField application={application} />

      <Field
        label={t("apply.employer.business.website.label")}
        error={problems.invalid.has("websiteUrl") ? t("apply.employer.business.website.error") : undefined}
      >
        <Input
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={300}
          value={draft.websiteUrl}
          onFocus={scrollFieldIntoView}
          onChangeText={(value) => change({ websiteUrl: value })}
        />
      </Field>
    </EmployerFrame>
  );
}

/**
 * Pins the business: search for the place, or use where the phone is now. The server's reverse
 * geocode then fills whatever address fields are still blank. Same flow as a rental's pickup pin.
 */
function FindOnMap({
  pinned,
  onPicked,
}: {
  pinned: boolean;
  onPicked: (latitude: string, longitude: string, location: ResolvedLocation | null) => void;
}) {
  const t = useT();
  const reverseGeocode = useReverseGeocode();

  function placePin(latitude: string, longitude: string) {
    reverseGeocode.mutate(
      { latitude, longitude },
      {
        onSuccess: (found) => onPicked(latitude, longitude, found),
        // The pin is still the pin; only the address text could not be filled in.
        onError: () => onPicked(latitude, longitude, null),
      },
    );
  }

  async function useMyLocation() {
    try {
      const position = await getCurrentPosition();
      placePin(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6));
    } catch {
      Alert.alert(
        t("apply.employer.business.mapPin.unavailable.title"),
        t("apply.employer.business.mapPin.unavailable.message"),
      );
    }
  }

  return (
    <View style={{ rowGap: 8 }}>
      <PlaceSearch
        onPick={(place) => placePin(place.latitude, place.longitude)}
        placeholder={t("apply.employer.business.mapPin.search")}
      />
      <Button
        variant="outline"
        icon={<MapPin size={16} color="#00112e" />}
        loading={reverseGeocode.isPending}
        onClick={() => void useMyLocation()}
      >
        {pinned
          ? t("apply.employer.business.mapPin.moveToMyLocation")
          : t("apply.employer.business.mapPin.useMyLocation")}
      </Button>
      {pinned ? (
        <View className="flex-row">
          <Badge tone="success">{t("workspaces.location.pinned")}</Badge>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The optional logo. It is saved the moment it is chosen (the server checks the file's own bytes),
 * separately from the rest of the form, so choosing one never costs what was typed.
 */
function LogoField({ application }: { application: Application }) {
  const t = useT();
  const upload = useUploadEmployerLogo();
  const remove = useRemoveEmployerLogo();
  const [problem, setProblem] = useState<string | null>(null);
  const logoUrl = application.employer?.business?.logo_url ?? "";
  const busy = upload.isPending || remove.isPending;
  const failure = upload.error ?? remove.error;

  async function choose() {
    setProblem(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setProblem(t("apply.employer.business.logo.permission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const type = asset.mimeType ?? "image/jpeg";
    if (!(LOGO_TYPES as readonly string[]).includes(type)) {
      setProblem(t("apply.employer.business.logo.wrongType"));
    } else if ((asset.fileSize ?? 0) > LOGO_MAX_BYTES) {
      setProblem(t("apply.employer.business.logo.tooBig"));
    } else {
      upload.mutate({ uri: asset.uri, name: asset.fileName ?? `logo-${Date.now()}.jpg`, type });
    }
  }

  return (
    <Field
      label={t("apply.employer.business.logo.label")}
      description={t("apply.employer.business.logo.hint")}
    >
      <View className="flex-row flex-wrap items-center gap-3">
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            accessibilityLabel={t("apply.employer.business.logo.alt")}
            className="size-16 rounded-control border border-line"
            resizeMode="cover"
          />
        ) : null}
        <Button
          variant="outline"
          icon={<ImagePlus size={16} color="#00112e" />}
          loading={upload.isPending}
          disabled={busy}
          onClick={() => void choose()}
        >
          {logoUrl ? t("apply.employer.business.logo.replace") : t("apply.employer.business.logo.upload")}
        </Button>
        {logoUrl ? (
          <Button
            variant="ghost"
            icon={<Trash2 size={16} color="#00112e" />}
            loading={remove.isPending}
            disabled={busy}
            onClick={() => remove.mutate()}
          >
            {t("apply.employer.business.logo.remove")}
          </Button>
        ) : null}
      </View>
      {problem ? (
        <Text accessibilityRole="alert" className="text-sm text-danger-text">
          {problem}
        </Text>
      ) : null}
      {failure && !problem ? (
        <Text accessibilityRole="alert" className="text-sm text-danger-text">
          {describeError(failure, "mutation").message}
        </Text>
      ) : null}
    </Field>
  );
}
