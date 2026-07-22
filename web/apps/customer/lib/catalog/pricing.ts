// ─────────────────────────────────────────────────────────────────────────────
// Pure pricing engine. Given a service's priced requirement fields and the
// customer's selections, produce an exact total plus the line-item breakdown
// that gets snapshotted onto the booking.
//
// The catalog advertises a "starts at" price (the cheapest variant); selecting
// requirements resolves it to an exact number. That exactness is what lets
// checkout authorize a precise amount.
//
// Total by construction: unknown keys and unknown option values are ignored
// rather than throwing, because config can drift ahead of a persisted cart.
// ─────────────────────────────────────────────────────────────────────────────

export type PricedOption = { value: string; pricePaise: number; description?: string };
export type SelectOption = { value: string; priceDeltaPaise?: number };

export type PricedDetailField =
  | { key: string; label: string; type: "variant"; options: PricedOption[]; required?: boolean }
  | {
      key: string;
      label: string;
      type: "select";
      options: SelectOption[];
      defaultValue?: string;
      required?: boolean;
      /**
       * How the options render. "pills" suits ≤4 short choices; "dropdown" is a
       * native <select>, better for longer lists. When omitted, the UI auto-picks
       * a dropdown once there are more than 4 options.
       */
      variant?: "pills" | "dropdown";
    }
  | {
      key: string;
      label: string;
      type: "counter";
      perUnitPaise?: number;
      min?: number;
      max?: number;
      defaultValue?: number;
      required?: boolean;
    }
  | { key: string; label: string; type: "addons"; options: PricedOption[]; required?: boolean }
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
      defaultValue?: string;
      required?: boolean;
    };

export type Selections = Record<string, string | number | string[] | undefined>;

export type LineItemKind = "variant" | "option" | "counter" | "addon" | "product";

export type LineItem = {
  key: string;
  label: string;
  value: string;
  qty: number;
  unitPaise: number;
  totalPaise: number;
  kind: LineItemKind;
};

export type PriceEstimate = {
  basePaise: number;
  addOnsPaise: number;
  totalPaise: number;
  lineItems: LineItem[];
};

/** The "Starts at" price — the cheapest variant, or 0 when a service has none. */
export function startingPricePaise(fields: PricedDetailField[]): number {
  const variant = fields.find((f) => f.type === "variant");
  if (!variant || variant.type !== "variant" || variant.options.length === 0) return 0;
  return Math.min(...variant.options.map((o) => o.pricePaise));
}

function asArray(value: Selections[string]): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

export function estimatePrice(
  fields: PricedDetailField[],
  selections: Selections,
): PriceEstimate {
  const lineItems: LineItem[] = [];
  let basePaise = 0;
  let addOnsPaise = 0;

  for (const field of fields) {
    const raw = selections?.[field.key];

    if (field.type === "variant") {
      const picked = field.options.find((o) => o.value === raw);
      // No selection (or a stale one) falls back to the cheapest option so the
      // displayed total always matches the advertised "starts at" price.
      const option =
        picked ??
        field.options.reduce<PricedOption | undefined>(
          (min, o) => (!min || o.pricePaise < min.pricePaise ? o : min),
          undefined,
        );
      if (!option) continue;
      basePaise += option.pricePaise;
      lineItems.push({
        key: field.key,
        label: field.label,
        value: option.value,
        qty: 1,
        unitPaise: option.pricePaise,
        totalPaise: option.pricePaise,
        kind: "variant",
      });
      continue;
    }

    if (field.type === "select") {
      const option = field.options.find((o) => o.value === raw);
      if (!option?.priceDeltaPaise) continue;
      addOnsPaise += option.priceDeltaPaise;
      lineItems.push({
        key: field.key,
        label: field.label,
        value: option.value,
        qty: 1,
        unitPaise: option.priceDeltaPaise,
        totalPaise: option.priceDeltaPaise,
        kind: "option",
      });
      continue;
    }

    if (field.type === "counter") {
      const unit = field.perUnitPaise ?? 0;
      const qty = Math.max(0, Number(raw ?? field.defaultValue ?? field.min ?? 0) || 0);
      if (unit === 0 || qty === 0) continue;
      const total = unit * qty;
      addOnsPaise += total;
      lineItems.push({
        key: field.key,
        label: field.label,
        value: String(qty),
        qty,
        unitPaise: unit,
        totalPaise: total,
        kind: "counter",
      });
      continue;
    }

    if (field.type === "addons") {
      for (const value of asArray(raw)) {
        const option = field.options.find((o) => o.value === value);
        if (!option) continue;
        addOnsPaise += option.pricePaise;
        lineItems.push({
          key: field.key,
          label: field.label,
          value: option.value,
          qty: 1,
          unitPaise: option.pricePaise,
          totalPaise: option.pricePaise,
          kind: "addon",
        });
      }
    }
    // "text" fields carry no price.
  }

  const totalPaise = Math.max(0, basePaise + addOnsPaise);
  return { basePaise, addOnsPaise, totalPaise, lineItems };
}
