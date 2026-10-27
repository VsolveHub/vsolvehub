"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, ShieldCheck, Truck, Info, AlertCircle, MapPin, Navigation } from "lucide-react";
import { isApiRequestError, type Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, ChoiceChips, Field, Input, IsoDateField, useToast } from "@vsolve/ui";

import { useAddresses, preferredAddressId, useCreateAddress, useReverseGeocode, useUpdateAddress, type Address } from "@/features/addresses/queries";
import { useCustomerProfile } from "@/features/account/queries";
import { AddressStage, isGeocoded } from "@/features/booking/view/address-stage";
import { completeOrOpenCheckout } from "../../payment/standalone-handoff";
import { calculateRentalDays, formatPaise, type RentalAsset } from "../model";
import { closedDayMessage, type PickupHours } from "../pickup";
import { bookRental, fetchRentalPlatformFee, type RentalMode } from "../queries";
import { PickupLocation } from "./pickup-location";

const BUSINESS_NAME = "Vsolve Hub";
const PINCODE = /^[1-9][0-9]{5}$/;

interface RentalBookPanelProps {
  /** The item page passes the detail payload, which adds the owner's pickup hours. */
  asset: RentalAsset & { pickup_hours?: PickupHours };
}

type DeliveryForm = { line: string; area: string; city: string; pincode: string; phone: string };
const EMPTY_DELIVERY: DeliveryForm = { line: "", area: "", city: "", pincode: "", phone: "" };

function extractPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function deliveryProblem(form: DeliveryForm): string | null {
  if (!form.line.trim()) return "Add the delivery address.";
  if (!form.city.trim()) return "Add the delivery city.";
  if (!PINCODE.test(form.pincode.trim())) return "Enter a 6-digit pincode for the delivery.";
  if (form.phone.replace(/\D/g, "").length < 10) return "Add a 10-digit phone number for the delivery.";
  return null;
}

function todayIso(): string {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!, 12, 0, 0);
  date.setDate(date.getDate() + days);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function RentalBookPanel({ asset }: RentalBookPanelProps) {
  const router = useRouter();
  const toast = useToast();

  const defaultStart = addDaysIso(todayIso(), 1);
  const defaultEnd = addDaysIso(todayIso(), 3);
  const hours = asset.pickup_hours ?? null;
  const deliveryOffered = Boolean(asset.delivery_available);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [mode, setMode] = useState<RentalMode>("PICKUP");
  const [delivery, setDelivery] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [deliveryNote, setDeliveryNote] = useState("");
  const isDelivery = mode === "DELIVERY";
  const pickupDayProblem = closedDayMessage(hours, startDate, "pickup");
  const returnDayProblem = closedDayMessage(hours, endDate, "return");

  const addressesQuery = useAddresses();
  const addresses = Array.isArray(addressesQuery.data) ? addressesQuery.data : [];
  const profileQuery = useCustomerProfile();
  const profile =
    profileQuery.data && typeof profileQuery.data === "object" && "phone_number" in profileQuery.data
      ? (profileQuery.data as Schemas["User"])
      : null;

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressOpenSignal, setAddressOpenSignal] = useState(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showManualAddressFields, setShowManualAddressFields] = useState(false);

  const reverseGeocode = useReverseGeocode();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const effectiveAddressId = preferredAddressId(addresses, selectedAddressId);
  const selectedAddress = addresses.find((a) => a.id === effectiveAddressId) ?? null;

  const handleSelectAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setDelivery((prev) => ({
      ...prev,
      line: [addr.line1, addr.line2].filter(Boolean).join(", "),
      area: addr.locality || addr.landmark || "",
      city: addr.city,
      pincode: addr.postal_code,
      phone: prev.phone || extractPhoneDigits(profile?.phone_number),
    }));
    setShowManualAddressFields(false);
    setError(null);
  };

  // Sync default saved address or user profile phone into the delivery form
  useEffect(() => {
    if (selectedAddress) {
      setDelivery((prev) => ({
        line: prev.line || [selectedAddress.line1, selectedAddress.line2].filter(Boolean).join(", "),
        area: prev.area || selectedAddress.locality || selectedAddress.landmark || "",
        city: prev.city || selectedAddress.city,
        pincode: prev.pincode || selectedAddress.postal_code,
        phone: prev.phone || extractPhoneDigits(profile?.phone_number),
      }));
    } else if (profile?.phone_number) {
      setDelivery((prev) => ({
        ...prev,
        phone: prev.phone || extractPhoneDigits(profile.phone_number),
      }));
    }
  }, [selectedAddress, profile?.phone_number]);

  const handleUseCurrentLocation = async () => {
    setLocationError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          reject(new Error("Location permission is not available on this device."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 12_000,
        });
      });
      const resolved = await reverseGeocode.mutateAsync({
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      });
      const created = await createAddress.mutateAsync({
        label: addresses.length === 0 ? "Home" : "Current Location",
        line1: resolved.line1,
        locality: resolved.locality,
        city: resolved.city,
        state: resolved.state,
        postal_code: resolved.postal_code,
        country_code: resolved.country_code,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        source: "REVERSE_GEOCODED",
        is_default: addresses.length === 0,
      });
      handleSelectAddress(created);
      toast.notify("Location detected and saved to your address book.");
    } catch {
      setLocationError("Could not determine your location. Please choose on the map or enter manually.");
    }
  };

  const createNewAddress = async (
    req: Schemas["AddressRequest"],
  ): Promise<Schemas["Address"] | null> => {
    try {
      const created = await createAddress.mutateAsync({
        ...req,
        is_default: addresses.length === 0,
      });
      handleSelectAddress(created);
      return created;
    } catch {
      return null;
    }
  };

  const maxQty = Math.max(1, asset.quantity_available ?? 1);
  const clampedQty = Math.min(Math.max(1, quantity), maxQty);
  const days = calculateRentalDays(startDate, endDate);
  const rentalChargePaise = days * asset.daily_rate_paise * clampedQty;
  const depositPaise = asset.deposit_paise * clampedQty;
  const platformFee = useQuery({
    queryKey: ["rental-platform-fee"],
    queryFn: fetchRentalPlatformFee,
    staleTime: 30_000,
  });
  const feePercent = platformFee.data?.percent ?? 0;
  const platformFeePaise = Math.floor((rentalChargePaise * feePercent) / 100);
  const totalDuePaise = rentalChargePaise + platformFeePaise + depositPaise;

  const mutation = useMutation({
    mutationFn: () =>
      bookRental({
        asset_id: asset.id,
        start_date: startDate,
        end_date: endDate,
        pickup_or_delivery_mode: mode,
        delivery_address: isDelivery
          ? {
              line: delivery.line.trim(),
              area: delivery.area.trim(),
              city: delivery.city.trim(),
              pincode: delivery.pincode.trim(),
              contact_phone: delivery.phone.trim(),
            }
          : undefined,
        delivery_note: deliveryNote.trim(),
        notes,
        quantity: clampedQty,
      }),
    onSuccess: async (booking) => {
      if (booking.status === "AWAITING_TRANSPORT_QUOTE") {
        // Nothing to pay yet: the owner prices the transport first.
        toast.notify(
          "Delivery request sent. You pay once you accept the owner's transport price.",
        );
        router.push("/rentals/mine");
        return;
      }
      const deposit = booking.deposit as
        | (typeof booking.deposit & { payment_attempt_id?: string | null })
        | undefined;

      const attemptId = deposit?.payment_attempt_id;

      if (!attemptId) {
        toast.notify("Rental booking confirmed.");
        router.push("/rentals/mine");
        return;
      }

      setIsHandingOff(true);
      try {
        const result = await completeOrOpenCheckout(String(attemptId), {
          businessName: BUSINESS_NAME,
          onAwaitingCapture: () =>
            toast.notify("Complete payment in Razorpay. Booking stays Pending until capture."),
        });

        if (result.mode === "simulated") {
          toast.notify(
            "Rental fee and deposit recorded. Razorpay is not configured, so payment was simulated.",
          );
        } else if (result.mode === "pending") {
          toast.notify(
            "Booking created and unpaid (Pending). Payment is still preparing — open My Rentals shortly to pay.",
          );
        } else {
          toast.notify("Payment submitted. Waiting for Razorpay capture — booking stays Pending until then.");
        }
        router.push("/rentals/mine");
      } catch (err) {
        setError(
          friendlyErrorMessage(
            err,
            "The payment provider could not be opened. Booking is Pending until paid.",
          ),
        );
        router.push("/rentals/mine");
      } finally {
        setIsHandingOff(false);
      }
    },
    onError: (err: unknown) => {
      if (isApiRequestError(err)) {
        if (err.code === "out_of_stock") {
          setError("Out of stock for these dates. Try different dates or another listing.");
          return;
        }
        if (err.code === "insufficient_quantity") {
          setError("Not enough quantity available for these dates. Try different dates.");
          return;
        }
      }
      const code = (err as { code?: string })?.code;
      if (code === "out_of_stock") {
        setError("Out of stock for these dates. Try different dates or another listing.");
        return;
      }
      if (code === "insufficient_quantity") {
        setError("Not enough quantity available for these dates. Try different dates.");
        return;
      }
      setError(friendlyErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!startDate || !endDate) {
      setError("Please select both start and end rental dates.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("Rental return date must be after pickup date.");
      return;
    }
    if (pickupDayProblem || returnDayProblem) {
      setError(pickupDayProblem ?? returnDayProblem);
      return;
    }
    if (isDelivery) {
      if (startDate <= todayIso()) {
        setError("Delivery needs at least a day to arrange. Choose a later pickup date.");
        return;
      }
      const problem = deliveryProblem(delivery);
      if (problem) {
        setError(problem);
        return;
      }
    }
    mutation.mutate();
  };

  const minStart = isDelivery ? addDaysIso(todayIso(), 1) : todayIso();
  const permanentlyOutOfStock = asset.quantity_available === 0;
  const isOutOfStockCode = (err: unknown): boolean => {
    if (!err) return false;
    if (isApiRequestError(err)) {
      return err.code === "out_of_stock" || err.code === "insufficient_quantity";
    }
    const code = (err as { code?: string })?.code;
    return code === "out_of_stock" || code === "insufficient_quantity";
  };
  const dateAwareUnavailable = isOutOfStockCode(mutation.error);
  const blockBooking = permanentlyOutOfStock || dateAwareUnavailable;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-raised">
      <h2 className="text-xl font-bold text-text">Book This Rental</h2>
      <p className="mt-1 text-xs text-text-secondary">
        Select your rental dates (DD/MM/YYYY). Zero hidden charges.
      </p>
      {permanentlyOutOfStock ? (
        <div className="mt-4 flex items-center gap-2 rounded-control border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
          <AlertCircle className="size-4 shrink-0" />
          <span>Out of stock</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Pickup Date
            </span>
            <IsoDateField
              required
              value={startDate}
              min={minStart}
              onChange={(value) => {
                setStartDate(value);
                setError(null);
                mutation.reset();
              }}
            />
            {pickupDayProblem ? (
              <p role="alert" className="text-[11px] font-medium text-danger-text">
                {pickupDayProblem}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Calendar className="size-3.5 text-text-secondary" />
              Return Date
            </span>
            <IsoDateField
              required
              value={endDate}
              min={startDate || minStart}
              onChange={(value) => {
                setEndDate(value);
                setError(null);
                mutation.reset();
              }}
            />
            {returnDayProblem ? (
              <p role="alert" className="text-[11px] font-medium text-danger-text">
                {returnDayProblem}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-text">How do you want to receive it?</span>
          <ChoiceChips
            label="How do you want to receive it?"
            name="rental-receive-mode"
            layout="bar"
            value={mode}
            onChange={(value) => {
              setMode(value === "DELIVERY" ? "DELIVERY" : "PICKUP");
              setError(null);
              mutation.reset();
            }}
            options={
              deliveryOffered
                ? [
                    { value: "PICKUP", label: "Self Pickup" },
                    { value: "DELIVERY", label: "Request Delivery" },
                  ]
                : [{ value: "PICKUP", label: "Self Pickup" }]
            }
          />
          {!deliveryOffered ? (
            <p className="text-[11px] text-text-secondary">This owner offers self pickup only.</p>
          ) : null}
        </div>

        {isDelivery ? (
          <div className="flex flex-col gap-3 rounded-control border border-line bg-surface-sunken p-3">
            <p className="flex items-start gap-2 text-xs text-text-secondary">
              <Truck className="mt-0.5 size-4 shrink-0 text-action" aria-hidden />
              <span>
                The owner checks your requirement, arranges a vehicle and sends a transport price.
                <strong className="text-text"> You pay nothing now.</strong> You pay the rent and
                transport together once you accept the price.
              </span>
            </p>

            {/* Address Selection Card / Location Prompt */}
            {selectedAddress ? (
              <div data-testid="selected-delivery-address" className="rounded-control border border-line bg-surface p-3.5 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary-100 text-primary-700 mt-0.5">
                      <MapPin className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text uppercase tracking-wide">
                          {selectedAddress.label || "Delivery address"}
                        </span>
                        {selectedAddress.is_default ? (
                          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary border border-line">
                            Default
                          </span>
                        ) : null}
                        {isGeocoded(selectedAddress) ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            Verified Pin
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-text leading-relaxed break-words font-medium">
                        {[
                          selectedAddress.line1,
                          selectedAddress.line2,
                          selectedAddress.locality,
                          selectedAddress.city,
                          selectedAddress.postal_code,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddressOpenSignal((s) => s + 1)}
                    className="shrink-0"
                  >
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-control border border-line bg-surface p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-warning-surface text-warning-text mt-0.5">
                    <MapPin className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-text">Choose delivery destination</p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      Avoid manual typing: detect your current location or pick from saved addresses.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={reverseGeocode.isPending || createAddress.isPending}
                    loadingLabel="Locating..."
                    onClick={() => void handleUseCurrentLocation()}
                  >
                    <Navigation className="size-3.5 mr-1" />
                    Use my current location
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddressOpenSignal((s) => s + 1)}
                  >
                    Saved addresses / Map
                  </Button>
                </div>
                {locationError ? (
                  <p role="alert" className="mt-2 text-xs font-medium text-danger-text">
                    {locationError}
                  </p>
                ) : null}
              </div>
            )}

            {/* Quick toggle to view or tweak manual address fields if desired */}
            {selectedAddress ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowManualAddressFields((prev) => !prev)}
                  className="text-[11px] font-medium text-text-secondary hover:text-text underline cursor-pointer"
                >
                  {showManualAddressFields ? "Hide address fields" : "Edit address text manually"}
                </button>
              </div>
            ) : null}

            {/* Manual address fields: visible if no address selected, or when user clicks 'Edit address text manually' */}
            <div className={showManualAddressFields || !selectedAddress ? "flex flex-col gap-3" : "hidden"}>
              <Field label="Delivery address" required>
                <Input
                  id="delivery-line"
                  value={delivery.line}
                  maxLength={240}
                  placeholder="House / flat, street"
                  onChange={(e) => setDelivery((d) => ({ ...d, line: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Area" showOptional={false}>
                  <Input
                    id="delivery-area"
                    value={delivery.area}
                    maxLength={120}
                    placeholder="Locality / Landmark"
                    onChange={(e) => setDelivery((d) => ({ ...d, area: e.target.value }))}
                  />
                </Field>
                <Field label="City" required>
                  <Input
                    id="delivery-city"
                    value={delivery.city}
                    maxLength={120}
                    placeholder="City"
                    onChange={(e) => setDelivery((d) => ({ ...d, city: e.target.value }))}
                  />
                </Field>
                <Field label="Pincode" required>
                  <Input
                    id="delivery-pincode"
                    inputMode="numeric"
                    maxLength={6}
                    value={delivery.pincode}
                    placeholder="6-digit pincode"
                    onChange={(e) =>
                      setDelivery((d) => ({ ...d, pincode: e.target.value.replace(/\D/g, "") }))
                    }
                  />
                </Field>
              </div>
            </div>

            {/* Phone & Delivery Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Phone for delivery" required>
                <Input
                  id="delivery-phone"
                  inputMode="tel"
                  maxLength={15}
                  value={delivery.phone}
                  placeholder="10-digit mobile number"
                  onChange={(e) => setDelivery((d) => ({ ...d, phone: e.target.value }))}
                />
              </Field>
              <Field label="Anything the owner should know?" showOptional={false}>
                <Input
                  id="delivery-note"
                  value={deliveryNote}
                  maxLength={480}
                  placeholder="e.g. 3rd floor, lift available"
                  onChange={(e) => setDeliveryNote(e.target.value)}
                />
              </Field>
            </div>
          </div>
        ) : (
          <PickupLocation address={asset.pickup_address} hours={hours} showMap />
        )}

        {maxQty > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text">Quantity</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={clampedQty <= 1 || permanentlyOutOfStock}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-sm font-bold text-text disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm font-extrabold text-text">{clampedQty}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={clampedQty >= maxQty || permanentlyOutOfStock}
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-sm font-bold text-text disabled:opacity-40"
              >
                +
              </button>
              <span className="text-[11px] text-text-secondary">
                up to {maxQty} available
              </span>
            </div>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text">Notes / Special Instructions (Optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Need masonry drill bits, planning concrete anchor installation"
            rows={2}
            className="rounded-control border border-line bg-surface-sunken p-3 text-xs text-text placeholder:text-text-secondary/60 focus:border-line-strong focus:outline-none"
          />
        </label>

        <div className="rounded-control border border-line bg-surface-sunken p-4 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-text-secondary">
            <span>
              Rental Duration ({days} day{days === 1 ? "" : "s"} × {formatPaise(asset.daily_rate_paise)}
              {clampedQty > 1 ? ` × ${clampedQty}` : ""})
            </span>
            <span className="font-semibold text-text">{formatPaise(rentalChargePaise)}</span>
          </div>

          {feePercent > 0 ? (
            <div className="flex justify-between items-center text-text-secondary">
              <span>Platform fee ({feePercent}%)</span>
              <span className="font-semibold text-text">{formatPaise(platformFeePaise)}</span>
            </div>
          ) : null}

          <div className="flex justify-between items-center text-text-secondary">
            <span className="flex items-center gap-1">
              Refundable Security Deposit
              <ShieldCheck className="size-3.5 text-emerald-600" />
            </span>
            <span className="font-semibold text-text">{formatPaise(depositPaise)}</span>
          </div>

          <div className="flex justify-between items-center text-text-secondary">
            <span>Transport</span>
            <span className="font-semibold text-text">
              {isDelivery ? "Quoted by the owner" : "Free (self pickup)"}
            </span>
          </div>

          <div className="border-t border-line pt-2.5 flex justify-between items-center font-bold text-sm text-text">
            <span>{isDelivery ? "Total before transport" : "Total Value"}</span>
            <span className="text-action text-base">{formatPaise(totalDuePaise)}</span>
          </div>

          <p className="text-[11px] text-text-secondary/80 flex items-start gap-1.5 pt-1">
            <Info className="size-3.5 shrink-0 text-text-secondary mt-0.5" />
            The security deposit is 100% refundable immediately upon equipment return and standard condition inspection.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-control bg-rose-50 border border-rose-200 p-3 text-xs font-medium text-rose-800">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={mutation.isPending || isHandingOff || blockBooking}
          loading={mutation.isPending || isHandingOff}
          loadingLabel={
            isHandingOff
              ? "Opening payment…"
              : isDelivery
                ? "Sending delivery request…"
                : "Creating rental booking…"
          }
          className="w-full py-3 text-sm font-bold"
        >
          {permanentlyOutOfStock
            ? "Out of stock"
            : dateAwareUnavailable
              ? "Unavailable for these dates"
              : isDelivery
                ? "Send delivery request"
                : "Confirm Rental Booking"}
        </Button>
      </form>

      {/* Address Stage Dialog (opened via addressOpenSignal) */}
      <AddressStage
        presentation="none"
        openSignal={addressOpenSignal}
        addresses={addresses}
        isLoading={addressesQuery.isPending}
        serviceability={null}
        isCheckingServiceability={false}
        selectedAddressId={effectiveAddressId}
        onSelect={handleSelectAddress}
        onUseCurrentLocation={() => void handleUseCurrentLocation()}
        isUsingCurrentLocation={reverseGeocode.isPending || createAddress.isPending}
        locationError={locationError}
        onUpdateAddress={(id, patch) => updateAddress.mutate({ addressId: id, patch })}
        isUpdatingAddress={updateAddress.isPending}
        addNew={{
          onCreate: createNewAddress,
          isCreating: createAddress.isPending,
          createError: null,
          onPostalCodeChange: () => {},
          draftServiceability: null,
          isCheckingDraftServiceability: false,
        }}
      />
    </div>
  );
}
