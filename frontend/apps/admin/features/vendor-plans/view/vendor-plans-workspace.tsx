"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorState, Field, Input, Spinner, formatMoney } from "@vsolve/ui";
import { useMemo, useState } from "react";

import {
  PREMIUM_CAPABILITIES,
  capabilityCodes,
  createOpsVendorPlan,
  fetchOpsVendorPlans,
  paiseToRupeeInput,
  rupeesToPaise,
  updateOpsVendorPlan,
  type OpsVendorPlan,
  type VendorPlanWrite,
} from "../queries";

const EMPTY_FORM = {
  serviceId: "",
  code: "",
  name: "",
  priceRupees: "",
  durationDays: "30",
  maxActiveListings: "3",
  premiumPriceRupees: "",
  details: "",
  capabilities: [] as string[],
  isActive: true,
};

function formFromPlan(plan: OpsVendorPlan) {
  return {
    serviceId: plan.service ?? "",
    code: plan.code,
    name: plan.name,
    priceRupees: paiseToRupeeInput(plan.price_paise),
    durationDays: String(plan.duration_days),
    maxActiveListings: String(plan.max_active_listings),
    premiumPriceRupees: paiseToRupeeInput(plan.premium_price_paise),
    details: plan.details ?? "",
    capabilities: capabilityCodes(plan.premium_capabilities),
    isActive: plan.is_active,
  };
}

export function VendorPlansWorkspace() {
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: ["ops", "vendor-plans"],
    queryFn: fetchOpsVendorPlans,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const selected = useMemo(
    () => catalog.data?.plans.find((plan) => plan.id === selectedId) ?? null,
    [catalog.data?.plans, selectedId],
  );

  const visiblePlans = useMemo(() => {
    const plans = catalog.data?.plans ?? [];
    if (serviceFilter === "ALL") return plans;
    if (serviceFilter === "GLOBAL") return plans.filter((plan) => !plan.service);
    return plans.filter((plan) => plan.service === serviceFilter);
  }, [catalog.data?.plans, serviceFilter]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pricePaise = rupeesToPaise(form.priceRupees);
      const premiumPaise = rupeesToPaise(form.premiumPriceRupees);
      const duration = Number(form.durationDays);
      const maxListings = Number(form.maxActiveListings);
      if (pricePaise == null || premiumPaise == null) {
        throw new Error("Enter plan price and premium add-on price in rupees.");
      }
      if (!form.name.trim()) {
        throw new Error("Enter a plan name.");
      }
      if (!Number.isInteger(duration) || duration < 1) {
        throw new Error("Duration must be a whole number of days.");
      }
      if (!Number.isInteger(maxListings) || maxListings < 1) {
        throw new Error("Max live listings must be a whole number.");
      }
      const body: VendorPlanWrite = {
        service: form.serviceId || null,
        name: form.name.trim(),
        price_paise: pricePaise,
        duration_days: duration,
        max_active_listings: maxListings,
        premium_capabilities: form.capabilities,
        premium_price_paise: premiumPaise,
        details: form.details.trim(),
        is_active: form.isActive,
      };
      if (selected) {
        return updateOpsVendorPlan(selected.id, body);
      }
      if (!form.code.trim()) {
        throw new Error("New plans need a unique code.");
      }
      return createOpsVendorPlan({ ...body, code: form.code.trim() });
    },
    onSuccess: (plan) => {
      setFormError(null);
      setSelectedId(plan.id);
      setForm(formFromPlan(plan));
      void queryClient.invalidateQueries({ queryKey: ["ops", "vendor-plans"] });
    },
    onError: (error: unknown) => {
      setFormError(error instanceof Error ? error.message : "Could not save this plan.");
    },
  });

  if (catalog.isPending) {
    return <Spinner />;
  }
  if (catalog.isError || !catalog.data) {
    return (
      <ErrorState
        severity="warning"
        title="Vendor plans could not be loaded"
        message="Operations access is required to configure subscription plans per service."
      />
    );
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Plans by service</h2>
            <p className="mt-1 text-sm text-text-secondary">
              A blank service applies the plan to every listing service. Premium placement stays an
              add-on on the plan that lists it.
            </p>
          </div>
          <select
            value={serviceFilter}
            onChange={(event) => setServiceFilter(event.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="ALL">All plans</option>
            <option value="GLOBAL">All services</option>
            {catalog.data.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {visiblePlans.length === 0 ? (
            <li className="py-6 text-sm text-text-secondary">No plans for this filter.</li>
          ) : (
            visiblePlans.map((plan) => {
              const active = plan.id === selectedId;
              return (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(plan.id);
                      setForm(formFromPlan(plan));
                      setFormError(null);
                    }}
                    className={[
                      "flex w-full flex-col gap-1 px-2 py-3 text-left text-sm",
                      active ? "bg-selected-surface" : "hover:bg-surface-hover",
                    ].join(" ")}
                  >
                    <span className="font-semibold text-text">
                      {plan.name}
                      <span className="ml-2 font-mono text-xs font-normal text-text-muted">
                        {plan.code}
                      </span>
                    </span>
                    <span className="text-xs text-text-secondary">
                      {plan.service_name ?? "All services"} · {formatMoney(plan.price_paise)} ·{" "}
                      {plan.duration_days} days · {plan.max_active_listings} live posts
                      {plan.is_active ? "" : " · inactive"}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{selected ? "Edit plan" : "New plan"}</h2>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedId(null);
              setForm(EMPTY_FORM);
              setFormError(null);
            }}
          >
            New
          </Button>
        </div>

        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <Field label="Service" showOptional={false}>
            <select
              value={form.serviceId}
              onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="">All services</option>
              {catalog.data.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.subcategory_name} — {service.name}
                </option>
              ))}
            </select>
          </Field>
          {!selected ? (
            <Field label="Code" showOptional={false}>
              <Input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
            </Field>
          ) : null}
          <Field label="Name" showOptional={false}>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan price (₹)" showOptional={false}>
              <Input
                value={form.priceRupees}
                onChange={(event) =>
                  setForm((current) => ({ ...current, priceRupees: event.target.value }))
                }
              />
            </Field>
            <Field label="Premium add-on (₹)" showOptional={false}>
              <Input
                value={form.premiumPriceRupees}
                onChange={(event) =>
                  setForm((current) => ({ ...current, premiumPriceRupees: event.target.value }))
                }
              />
            </Field>
            <Field label="Duration (days)" showOptional={false}>
              <Input
                value={form.durationDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, durationDays: event.target.value }))
                }
              />
            </Field>
            <Field label="Max live listings" showOptional={false}>
              <Input
                value={form.maxActiveListings}
                onChange={(event) =>
                  setForm((current) => ({ ...current, maxActiveListings: event.target.value }))
                }
              />
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Premium capabilities</legend>
            {PREMIUM_CAPABILITIES.map((capability) => (
              <label key={capability.code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.capabilities.includes(capability.code)}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      capabilities: event.target.checked
                        ? [...current.capabilities, capability.code]
                        : current.capabilities.filter((code) => code !== capability.code),
                    }));
                  }}
                />
                {capability.label}
              </label>
            ))}
          </fieldset>
          <Field label="Additional details">
            <textarea
              value={form.details}
              onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))}
              rows={4}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
            Active — partners can buy this plan
          </label>
          {formError ? <p className="text-sm text-rose-700">{formError}</p> : null}
          <Button type="submit" loading={saveMutation.isPending}>
            {selected ? "Save plan" : "Create plan"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
