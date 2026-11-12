"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Input, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { durationText, fromInput, toInput } from "../model";
import { usePassPlans, useSavePassPlan, type PassPlan } from "../queries";

function PlanDialog({ plan, onClose }: { plan: PassPlan | null; onClose: () => void }) {
  const save = useSavePassPlan();
  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? toInput(plan.price_paise, "rupees") : "");
  const [hours, setHours] = useState(plan ? String(plan.duration_hours) : "24");
  const [active, setActive] = useState(plan?.is_active ?? true);
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const pricePaise = fromInput(price, "rupees");
    const duration = fromInput(hours, "minutes");
    if (!name.trim()) return setProblem("Give the plan a name captains will see.");
    if (!plan && !code.trim()) return setProblem("Give the plan a code, for example DAILY_BIKE.");
    if (pricePaise === null) return setProblem("Enter the price in rupees.");
    if (duration === null || duration < 1) return setProblem("A pass lasts at least 1 whole hour.");
    setProblem(null);
    const body = { name: name.trim(), price_paise: pricePaise, duration_hours: duration, is_active: active };
    if (plan) save.mutate({ planId: plan.id, body }, { onSuccess: onClose });
    else save.mutate({ body: { ...body, code: code.trim().toUpperCase() } }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.isPending) onClose();
      }}
      title={plan ? `Edit ${plan.name}` : "Add a pass plan"}
      description={
        plan
          ? "Passes already bought keep their price and dates. Only new purchases change."
          : "Captains can buy it as soon as it is saved and active."
      }
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} loadingLabel="Saving" onClick={submit}>
            {plan ? "Save" : "Add plan"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" required description={plan ? "Fixed once created." : undefined}>
          <Input value={code} disabled={plan !== null} onChange={(e) => setCode(e.target.value)} maxLength={32} />
        </Field>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Price (₹)" required>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Lasts (hours)" required>
          <Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Captains can buy this plan
      </label>
      {problem || save.error ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {problem ?? friendlyErrorMessage(save.error)}
        </p>
      ) : null}
    </Dialog>
  );
}

/** The Daily Pass plans captains buy to go on duty. */
export function PassPlans() {
  const plans = usePassPlans();
  const [editing, setEditing] = useState<{ plan: PassPlan | null } | null>(null);

  if (plans.isPending) return <Spinner />;
  if (plans.isError) {
    return (
      <ErrorState
        title="We couldn't load pass plans"
        message={friendlyErrorMessage(plans.error)}
        actionLabel="Try again"
        onAction={() => void plans.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing({ plan: null })}>
          Add plan
        </Button>
      </div>
      {plans.data.length === 0 ? (
        <EmptyState title="No pass plans" description="Captains need an active plan to go on duty." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Lasts</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {plans.data.map((plan) => (
                <tr key={plan.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-semibold">{plan.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{plan.code}</td>
                  <td className="px-4 py-3 text-right">{plan.price_paise === 0 ? "Free" : formatMoney(plan.price_paise)}</td>
                  <td className="px-4 py-3">{durationText(plan.duration_hours)}</td>
                  <td className="px-4 py-3">
                    {plan.is_active ? <Badge tone="success">On sale</Badge> : <Badge tone="neutral">Off</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ plan })}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? <PlanDialog plan={editing.plan} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
