"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, EmptyState, Field, Input, Sheet, Textarea, formatMoney } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import { rupeesToPaise } from "./model/bookings";
import {
  createOpsStayPlan,
  fetchOpsStayPlans,
  updateOpsStayPlan,
  type OpsStaySubscriptionPlan,
  type StayPlanDraft,
} from "./queries";

export type Draft = {
  code: string;
  name: string;
  price: string;
  durationDays: string;
  maxProperties: string;
  details: string;
  isActive: boolean;
};

const EMPTY: Draft = {
  code: "",
  name: "",
  price: "",
  durationDays: "30",
  maxProperties: "2",
  details: "",
  isActive: true,
};

function toDraft(plan: OpsStaySubscriptionPlan): Draft {
  return {
    code: plan.code,
    name: plan.name,
    price: String((plan.price_paise ?? 0) / 100),
    durationDays: String(plan.duration_days ?? 30),
    maxProperties: String(plan.max_properties ?? 0),
    details: plan.details ?? "",
    isActive: plan.is_active ?? true,
  };
}

function wholeNumber(raw: string): number | null {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

/** The form, checked and turned into the request body, or the first thing to fix. */
export function validatePlanDraft(
  draft: Draft,
  isNew: boolean,
): { body: StayPlanDraft } | { error: string } {
  const price = rupeesToPaise(draft.price);
  const duration = wholeNumber(draft.durationDays);
  const maxProperties = wholeNumber(draft.maxProperties);
  if (isNew && !/^[a-z0-9_-]+$/i.test(draft.code.trim())) {
    return { error: "The code is letters, numbers, dashes or underscores, for example pro-monthly." };
  }
  if (!draft.name.trim()) return { error: "Give the plan a name hosts will recognise." };
  if (price === null) return { error: "Type the price in rupees, for example 499." };
  if (!duration) return { error: "Type how many days the plan lasts, for example 30." };
  if (maxProperties === null) return { error: "Type how many properties it allows. 0 means no limit." };
  return {
    body: {
      code: draft.code.trim(),
      name: draft.name.trim(),
      price_paise: price,
      duration_days: duration,
      max_properties: maxProperties,
      details: draft.details.trim(),
      is_active: draft.isActive,
    },
  };
}

/** The plans stay hosts subscribe to: price, length and how many properties each allows. */
export function StayPlans() {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["ops-stay-plans"], queryFn: fetchOpsStayPlans });
  const [editing, setEditing] = useState<OpsStaySubscriptionPlan | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const open = (plan: OpsStaySubscriptionPlan | "new") => {
    setDraft(plan === "new" ? EMPTY : toDraft(plan));
    setError(null);
    setEditing(plan);
  };

  const save = useMutation({
    mutationFn: (body: StayPlanDraft) =>
      editing === "new" || editing === null
        ? createOpsStayPlan(body)
        : updateOpsStayPlan(editing.id, {
            name: body.name,
            price_paise: body.price_paise,
            duration_days: body.duration_days,
            max_properties: body.max_properties,
            details: body.details,
            is_active: body.is_active,
          }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["ops-stay-plans"] });
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const checked = validatePlanDraft(draft, editing === "new");
    if ("error" in checked) return setError(checked.error);
    setError(null);
    save.mutate(checked.body);
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Hosts pick one of the active plans in their portal. Turning a plan off hides it from new
          hosts; current subscribers keep it until it runs out.
        </p>
        <Button onClick={() => open("new")}>New plan</Button>
      </div>

      {plans.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {plans.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(plans.error)}</p> : null}
      {plans.data && plans.data.length === 0 ? (
        <EmptyState title="No plans yet" description="Create the first plan hosts can subscribe to." />
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {plans.data?.map((plan) => (
          <li key={plan.id}>
            <Card className="flex h-full flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-navy-900">{plan.name}</p>
                  <p className="text-xs text-text-muted">{plan.code}</p>
                </div>
                <Badge tone={plan.is_active ? "success" : "neutral"}>
                  {plan.is_active ? "Offered" : "Turned off"}
                </Badge>
              </div>
              <p className="text-lg font-bold text-navy-900">
                {formatMoney(plan.price_paise ?? 0)}
                <span className="text-sm font-normal text-text-secondary"> / {plan.duration_days} days</span>
              </p>
              <p className="text-sm text-text-secondary">
                {plan.max_properties ? `Up to ${plan.max_properties} properties` : "Unlimited properties"}
              </p>
              {plan.details ? <p className="text-sm">{plan.details}</p> : null}
              <div className="mt-auto pt-2">
                <Button size="sm" variant="outline" onClick={() => open(plan)}>
                  Edit
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Sheet
        side="end"
        open={editing !== null}
        onOpenChange={(next) => (next ? null : setEditing(null))}
        title={editing === "new" ? "New host plan" : "Edit host plan"}
        description="Prices are in rupees. Hosts see the name, price and details."
        footer={
          <>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="stay-plan-form" loading={save.isPending}>
              Save plan
            </Button>
          </>
        }
      >
        <form id="stay-plan-form" className="flex flex-col gap-4 py-3" onSubmit={onSubmit} noValidate>
          {editing === "new" ? (
            <Field label="Code" required description="Fixed once saved. Used in reports.">
              <Input value={draft.code} maxLength={40} placeholder="pro-monthly" onChange={(e) => set({ code: e.target.value })} />
            </Field>
          ) : null}
          <Field label="Name" required>
            <Input value={draft.name} maxLength={80} placeholder="Pro" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price (₹)" required>
              <Input inputMode="decimal" value={draft.price} onChange={(e) => set({ price: e.target.value })} />
            </Field>
            <Field label="Days" required>
              <Input inputMode="numeric" value={draft.durationDays} onChange={(e) => set({ durationDays: e.target.value })} />
            </Field>
            <Field label="Properties" required description="0 = no limit">
              <Input inputMode="numeric" value={draft.maxProperties} onChange={(e) => set({ maxProperties: e.target.value })} />
            </Field>
          </div>
          <Field label="Details">
            <Textarea value={draft.details} onChange={(e) => set({ details: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
            Offer this plan to hosts
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          ) : null}
        </form>
      </Sheet>
    </section>
  );
}
