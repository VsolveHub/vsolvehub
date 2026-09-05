import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import {
  EMPTY_COMMERCIAL_ESTIMATE,
  activeQuickSet,
  addMaterial,
  allocateInstallments,
  applyQuickSet,
  catalogueItemLine,
  composeScopeSummary,
  newItemLine,
  removeMaterial,
  resolveMaterialList,
  setMaterialQuantity,
  toCommercialPreviewRequest,
  toCommercialProposalRequest,
  validateCommercialEstimate,
  withTemplateInstallments,
  type CommercialEstimateDraft,
} from "./commercial-estimate-draft";

/**
 * The rate-card estimate's pure half (contract 1.48.0).
 *
 * Every rule here is one the server also enforces: a catalogue line names its
 * `work_item_id`, a custom line says `is_custom`, installments reconcile to
 * the paisa, and the shopping list carries no price. The client's copy exists
 * so a vendor is stopped before the round trip; the server's copy decides.
 */

function entry(overrides: Partial<Schemas["PriceBookEntry"]> & { name: string; id?: string; unit?: string; group?: string; bundles?: Record<string, number> }): Schemas["PriceBookEntry"] {
  const { name, id, unit, group, bundles, ...rest } = overrides;
  return {
    work_item: {
      id: id ?? `00000000-0000-4000-8000-${name.padEnd(12, "0").slice(0, 12).replace(/[^0-9a-f]/g, "0")}`,
      skill: "99999999-9999-4999-8999-999999999999",
      name,
      unit: unit ?? "each",
      status: "ACTIVE",
      group: group ?? "Points",
      bundle_quantities: bundles ?? null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
    reference_rate_paise: 15_000,
    rate_version: 1,
    floor_paise: 12_000,
    ceiling_paise: 19_500,
    partner_rate_paise: null,
    partner_is_active: true,
    is_default_rate: true,
    trade_code: "electrician",
    trade_name: "Electrician",
    ...rest,
  };
}

const light = entry({ name: "Light point", id: "11111111-1111-4111-8111-111111111111", bundles: { "1bhk": 6, "2bhk": 9, "3bhk": 13 } });
const fan = entry({ name: "Fan point", id: "22222222-2222-4222-8222-222222222222", bundles: { "1bhk": 2, "2bhk": 3 }, partner_rate_paise: 18_000, is_default_rate: false });
const helper = entry({ name: "Helper", id: "33333333-3333-4333-8333-333333333333", unit: "day", group: "Labour", bundles: { "1bhk": 1 } });

function itemWise(overrides: Partial<CommercialEstimateDraft> = {}): CommercialEstimateDraft {
  return { ...EMPTY_COMMERCIAL_ESTIMATE, mode: "ITEM_WISE", ...overrides };
}

describe("quick sets", () => {
  it("sets every item that carries a quantity for the set, and never a labour row", () => {
    const draft = applyQuickSet(EMPTY_COMMERCIAL_ESTIMATE, [light, fan, helper], "2bhk");

    expect(draft.mode).toBe("ITEM_WISE");
    expect(draft.itemLines.map((line) => [line.title, line.quantity])).toEqual([
      ["Light point", "9"],
      ["Fan point", "3"],
    ]);
  });

  it("overwrites a quantity but keeps an edited rate", () => {
    const edited = itemWise({
      itemLines: [{ ...catalogueItemLine(light, 4), ratePaise: 17_000 }],
    });
    const draft = applyQuickSet(edited, [light, fan], "1bhk");
    const lightLine = draft.itemLines.find((line) => line.workItemId === light.work_item.id);

    expect(lightLine?.quantity).toBe("6");
    expect(lightLine?.ratePaise).toBe(17_000);
  });

  it("starts from the vendor's saved rate, else the city reference", () => {
    const draft = applyQuickSet(EMPTY_COMMERCIAL_ESTIMATE, [light, fan], "1bhk");
    expect(draft.itemLines.map((line) => line.ratePaise)).toEqual([15_000, 18_000]);
  });
});

describe("the selected quick set", () => {
  const entries = [light, fan, helper];

  it("is the set whose quantities the lines match exactly, and nothing otherwise", () => {
    expect(activeQuickSet(itemWise(), entries)).toBeNull();

    const twoBhk = applyQuickSet(itemWise(), entries, "2bhk");
    expect(activeQuickSet(twoBhk, entries)).toBe("2bhk");

    // Nudge one quantity and the chip goes quiet: the set is no longer what is
    // on the estimate.
    const edited = {
      ...twoBhk,
      itemLines: twoBhk.itemLines.map((line, index) =>
        index === 0 ? { ...line, quantity: String(Number(line.quantity) + 1) } : line,
      ),
    };
    expect(activeQuickSet(edited, entries)).toBeNull();
  });
});

describe("what goes on the wire", () => {
  const draft = itemWise({
    itemLines: [catalogueItemLine(light, 8), { ...newItemLine("custom-1", "Earth pit"), ratePaise: 250_000 }],
    paymentTemplate: "COMPLETION",
  });
  const body = toCommercialProposalRequest({
    invitationId: "inv",
    siteVisitId: "visit",
    draft: withTemplateInstallments(draft),
    materialList: [{ title: "1.5 sq mm wire", spec: "FR, copper", unit: "coil", quantity: "2", note: "" }],
  });

  it("names the catalogue item on a catalogue line", () => {
    expect(body.item_lines?.[0]).toMatchObject({
      title: "Light point",
      work_item_id: light.work_item.id,
      is_custom: false,
      rate_paise: 15_000,
      quantity: "8",
    });
  });

  it("flags a custom line and sends no item id", () => {
    expect(body.item_lines?.[1]).toMatchObject({ title: "Earth pit", is_custom: true });
    expect(body.item_lines?.[1]).not.toHaveProperty("work_item_id");
  });

  it("hands the customer a shopping list with no money on it", () => {
    expect(body.material_list).toEqual([
      { title: "1.5 sq mm wire", spec: "FR, copper", unit: "coil", quantity: "2", note: "" },
    ]);
    expect(body.material_brand_tier).toBe("");
  });

  it("keeps the shopping list off the preview body", () => {
    const preview = toCommercialPreviewRequest({ invitationId: "inv", siteVisitId: "visit", draft: withTemplateInstallments(draft) });
    expect(preview).not.toHaveProperty("material_list");
  });

  it("composes the scope and inclusions from the tapped items when left blank", () => {
    expect(body.scope_summary).toBe("Light point ×8, Earth pit ×1");
    expect(body.inclusions).toEqual(["Light point", "Earth pit"]);
    expect(composeScopeSummary(draft)).toBe("Light point ×8, Earth pit ×1");
  });

  it("no longer demands twenty characters of scope", () => {
    expect(validateCommercialEstimate(withTemplateInstallments(draft))).toEqual({});
  });

  it("refuses a catalogue rate outside its band before the round trip", () => {
    const outside = itemWise({ itemLines: [{ ...catalogueItemLine(light, 1), ratePaise: 20_000 }] });
    expect(validateCommercialEstimate(withTemplateInstallments(outside))["item-0"]).toMatch(/outside/);
  });
});

describe("payment templates", () => {
  it("splits to the paisa with the remainder on the last part", () => {
    expect(allocateInstallments(100_001, "HALF")).toEqual([50_000, 50_001]);
    expect(allocateInstallments(100_000, "THIRDS")).toEqual([33_333, 33_333, 33_334]);
    expect(allocateInstallments(123_456, "COMPLETION")).toEqual([123_456]);
  });

  it("re-allocates when the service amount moves, and leaves a custom split alone", () => {
    const half = withTemplateInstallments(itemWise({ itemLines: [catalogueItemLine(light, 8)] }));
    expect(half.installments.map((row) => row.amountPaise)).toEqual([60_000, 60_000]);

    const more = withTemplateInstallments({ ...half, itemLines: [catalogueItemLine(light, 9)] });
    expect(more.installments.map((row) => row.amountPaise)).toEqual([67_500, 67_500]);

    const custom = withTemplateInstallments({
      ...more,
      paymentTemplate: "CUSTOM",
      installments: [{ id: "x", title: "All", deliverable: "", amountPaise: 1, endsOn: null }],
    });
    expect(custom.installments.map((row) => row.amountPaise)).toEqual([1]);
  });

  it("includes named charges in the amount it splits", () => {
    const withTransport = withTemplateInstallments(
      itemWise({
        paymentTemplate: "COMPLETION",
        itemLines: [catalogueItemLine(light, 2)],
        otherCharges: [{ id: "c", code: "TRANSPORT", label: "Transportation", amountPaise: 5_000 }],
      }),
    );
    expect(withTransport.installments.map((row) => row.amountPaise)).toEqual([35_000]);
  });
});

describe("the shopping list merge rule", () => {
  const wire = { title: "1.5 sq mm wire", spec: "FR", unit: "coil", quantity: "2", note: "" };
  const boxes = { title: "Modular box", spec: "3M", unit: "nos", quantity: "8", note: "" };

  it("keeps an edited quantity when a later preview suggests the row again", () => {
    let draft = itemWise();
    draft = setMaterialQuantity(draft, wire, "3");

    expect(resolveMaterialList([wire, boxes], draft)).toEqual([{ ...wire, quantity: "3" }, boxes]);
    expect(resolveMaterialList([{ ...wire, quantity: "4" }, boxes], draft)).toEqual([{ ...wire, quantity: "3" }, boxes]);
  });

  it("keeps a removed row gone, and adds a vendor's own row after the suggestion", () => {
    let draft = itemWise();
    draft = removeMaterial(draft, boxes);
    draft = addMaterial(draft, { title: "Tape", spec: "", unit: "roll", quantity: "2", note: "" });

    expect(resolveMaterialList([wire, boxes], draft).map((row) => row.title)).toEqual(["1.5 sq mm wire", "Tape"]);
  });

  it("shows a row once when the vendor added what the server later suggested", () => {
    let draft = itemWise();
    draft = addMaterial(draft, { ...wire, quantity: "5" });

    expect(resolveMaterialList([wire], draft)).toEqual([{ ...wire, quantity: "5" }]);
  });

  it("un-removes a row the vendor adds back", () => {
    let draft = itemWise();
    draft = removeMaterial(draft, boxes);
    draft = addMaterial(draft, boxes);

    expect(resolveMaterialList([boxes], draft)).toEqual([boxes]);
  });
});
