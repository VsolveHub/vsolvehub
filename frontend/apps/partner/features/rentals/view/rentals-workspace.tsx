"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Field, Input, Select, formatMoney } from "@vsolve/ui";
import { useMemo, useState, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  bookingActionLabel,
  canSubmitAsset,
  partnerBookingAction,
  type BookingAction,
} from "@/features/rentals/booking-actions";
import {
  createPartnerRentalAsset,
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookings,
  fetchRentalTaxonomy,
  partnerRentalBookingAction,
  rentalVariantChoices,
  submitPartnerRentalAsset,
  type RentalTaxonomySubcategory,
} from "@/features/rentals/queries";

function schemaPropertyKeys(schema: Record<string, unknown> | undefined): string[] {
  const props = schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  return Object.keys(props as Record<string, unknown>);
}

export function PartnerRentalsWorkspace() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [location, setLocation] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const capabilities = usePartnerCapabilities();
  const capabilityVariants = rentalVariantChoices(capabilities.data?.capabilities);
  const taxonomy = useQuery({
    queryKey: ["partner-rentals", "taxonomy"],
    queryFn: fetchRentalTaxonomy,
  });
  const assets = useQuery({
    queryKey: ["partner-rentals", "assets"],
    queryFn: fetchPartnerRentalAssets,
  });
  const bookings = useQuery({
    queryKey: ["partner-rentals", "bookings"],
    queryFn: fetchPartnerRentalBookings,
  });

  const subcategories: RentalTaxonomySubcategory[] = taxonomy.data ?? [];
  const selectedSub = subcategories.find((s) => s.slug === subcategorySlug);
  const selectedService = selectedSub?.services.find((s) => s.id === serviceId);
  const selectedVariant = selectedService?.variants.find((v) => v.id === variantId);
  const schemaKeys = useMemo(
    () => schemaPropertyKeys(selectedVariant?.asset_schema as Record<string, unknown> | undefined),
    [selectedVariant],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
  };

  const create = useMutation({
    mutationFn: createPartnerRentalAsset,
    onSuccess: () => {
      setTitle("");
      setSubcategorySlug("");
      setServiceId("");
      setVariantId("");
      setDailyRate("");
      setDeposit("");
      setLocation("");
      setImageUrls("");
      setStructuredFields({});
      setFormError(null);
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const act = useMutation({
    mutationFn: async (
      input: { kind: "submit"; id: string } | { kind: "booking"; id: string; action: BookingAction },
    ) => {
      if (input.kind === "submit") return submitPartnerRentalAsset(input.id);
      return partnerRentalBookingAction(input.id, input.action);
    },
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const daily = Number(dailyRate);
    const depositPaise = Number(deposit);
    if (!variantId || !title.trim() || !Number.isInteger(daily) || daily < 1) {
      setFormError("Choose subcategory → service → variant, a title, and a daily rate in paise.");
      return;
    }
    if (deposit.trim() !== "" && (!Number.isInteger(depositPaise) || depositPaise < 0)) {
      setFormError("Deposit must be a whole number of paise.");
      return;
    }
    const urls = imageUrls
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter(Boolean);
    const fields: Record<string, string | number | boolean> = {};
    for (const key of schemaKeys) {
      const raw = structuredFields[key]?.trim() ?? "";
      if (!raw) continue;
      if (raw === "true" || raw === "false") fields[key] = raw === "true";
      else if (/^\d+$/.test(raw)) fields[key] = Number(raw);
      else fields[key] = raw;
    }
    setFormError(null);
    create.mutate({
      variant_id: variantId,
      title: title.trim(),
      description: "",
      location_text: location.trim(),
      daily_rate_paise: daily,
      deposit_paise: deposit.trim() === "" ? 0 : depositPaise,
      asset_identifier: "",
      structured_fields: fields,
      image_urls: urls,
    } as Parameters<typeof createPartnerRentalAsset>[0]);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-navy-900">Rentals</h1>
      <Card>
        <form className="flex flex-col gap-3" onSubmit={onCreate}>
          <h2 className="text-base font-semibold text-navy-900">Create asset</h2>
          <Field label="Subcategory">
            <Select
              id="rental-subcategory"
              value={subcategorySlug}
              onChange={(e) => {
                setSubcategorySlug(e.target.value);
                setServiceId("");
                setVariantId("");
                setStructuredFields({});
              }}
            >
              <option value="">Select subcategory</option>
              {subcategories.map((sub) => (
                <option key={sub.id} value={sub.slug}>
                  {sub.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service">
            <Select
              id="rental-service"
              value={serviceId}
              disabled={!selectedSub}
              onChange={(e) => {
                setServiceId(e.target.value);
                setVariantId("");
                setStructuredFields({});
                const svc = selectedSub?.services.find((s) => s.id === e.target.value);
                const first = svc?.variants[0];
                if (first) {
                  setVariantId(first.id);
                  if (first.default_deposit_paise != null) {
                    setDeposit(String(first.default_deposit_paise));
                  }
                }
              }}
            >
              <option value="">Select service</option>
              {selectedSub?.services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Variant">
            <Select
              id="rental-variant"
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setStructuredFields({});
                const v =
                  selectedService?.variants.find((x) => x.id === e.target.value) ??
                  capabilityVariants.find((x) => x.id === e.target.value);
                const taxV = selectedService?.variants.find((x) => x.id === e.target.value);
                if (taxV?.default_deposit_paise != null) {
                  setDeposit(String(taxV.default_deposit_paise));
                }
                void v;
              }}
            >
              <option value="">Select a variant</option>
              {(selectedService?.variants.length
                ? selectedService.variants.map((v) => ({ id: v.id, name: v.name }))
                : capabilityVariants
              ).map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title">
            <Input id="rental-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {schemaKeys.map((key) => (
            <Field key={key} label={key.replace(/_/g, " ")}>
              <Input
                id={`rental-field-${key}`}
                value={structuredFields[key] ?? ""}
                onChange={(e) =>
                  setStructuredFields((current) => ({ ...current, [key]: e.target.value }))
                }
              />
            </Field>
          ))}
          <Field label="Daily rate (paise)">
            <Input
              id="rental-rate"
              inputMode="numeric"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
            />
          </Field>
          <Field label="Deposit (paise)">
            <Input
              id="rental-deposit"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>
          <Field label="Location">
            <Input
              id="rental-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          <Field label="Image URLs (comma or newline separated)">
            <Input
              id="rental-images"
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          {formError ? <p className="text-sm text-danger-text">{formError}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            Create asset
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Assets</h2>
        {assets.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {assets.error ? (
          <p className="text-sm text-danger-text">{(assets.error as Error).message}</p>
        ) : null}
        {assets.data && assets.data.length === 0 ? (
          <EmptyState compact title="No assets yet" description="Create an asset to list it for review." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {assets.data?.map((asset) => {
            const media = (asset as { media?: { url?: string }[] }).media;
            const thumb = media?.[0]?.url;
            return (
              <li key={asset.id} className="rounded-card border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-14 rounded-control object-cover" />
                    ) : null}
                    <div>
                      <p className="font-semibold text-navy-900">{asset.title}</p>
                      <p className="text-sm text-text-secondary">
                        {formatMoney(asset.daily_rate_paise)} / day
                        {asset.location_text ? ` · ${asset.location_text}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge>{asset.public_state}</Badge>
                </div>
                {canSubmitAsset(asset.moderation_status) ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: "submit", id: asset.id })}
                    >
                      Submit for review
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Bookings</h2>
        {bookings.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {bookings.error ? (
          <p className="text-sm text-danger-text">{(bookings.error as Error).message}</p>
        ) : null}
        {bookings.data && bookings.data.length === 0 ? (
          <EmptyState compact title="No bookings yet" description="Bookings appear here after a customer reserves an asset." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {bookings.data?.map((booking) => {
            const action = partnerBookingAction(booking.status ?? "", booking.deposit?.status);
            return (
              <li key={booking.id} className="rounded-card border border-line p-3">
                <p className="font-semibold text-navy-900">{booking.asset.title}</p>
                <p className="text-sm text-text-secondary">
                  {booking.status} · {formatMoney(booking.price_paise)} · {booking.start_date} – {booking.end_date}
                </p>
                {action ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: "booking", id: booking.id, action })}
                    >
                      {bookingActionLabel(action)}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
