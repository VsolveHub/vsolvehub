import {
  saveCommercialEstimate,
  loadCommercialEstimate,
  clearCommercialEstimate,
  EMPTY_COMMERCIAL_ESTIMATE,
  newItemLine,
} from "./commercial-estimate-draft";
import {
  saveOnsiteDraft,
  loadOnsiteDraft,
  clearOnsiteDraft,
  EMPTY_ONSITE_DRAFT,
  EMPTY_ONSITE_STAGE,
} from "./onsite-draft";
import { storageAdapter } from "@vsolve/mobile-core";

describe("Draft storage round-trips", () => {
  const invitationId = "inv-test-123";

  afterEach(async () => {
    await clearCommercialEstimate(invitationId);
    await clearOnsiteDraft(invitationId);
  });

  describe("Commercial Estimate draft", () => {
    it("saves, loads and clears commercial estimate draft", async () => {
      expect(await loadCommercialEstimate(invitationId)).toBeNull();

      const item = {
        ...newItemLine("line-1", "Electrical", "Wiring work"),
        quantity: "100",
        ratePaise: 4500,
      };

      const draft = {
        ...EMPTY_COMMERCIAL_ESTIMATE,
        mode: "ITEM_WISE" as const,
        itemLines: [item],
      };

      await saveCommercialEstimate(invitationId, draft);
      const loaded = await loadCommercialEstimate(invitationId);

      expect(loaded).not.toBeNull();
      expect(loaded?.mode).toBe("ITEM_WISE");
      expect(loaded?.itemLines).toHaveLength(1);
      expect(loaded?.itemLines[0].title).toBe("Wiring work");
      expect(loaded?.itemLines[0].ratePaise).toBe(4500);

      await clearCommercialEstimate(invitationId);
      expect(await loadCommercialEstimate(invitationId)).toBeNull();
    });

    it("survives corrupt storage gracefully", async () => {
      await storageAdapter.setItem(`vsolve.m2.commercial-estimate.v1.${invitationId}`, "{not json");
      expect(await loadCommercialEstimate(invitationId)).toBeNull();
    });
  });

  describe("Onsite draft", () => {
    it("saves, loads and clears onsite draft", async () => {
      expect(await loadOnsiteDraft(invitationId)).toBeNull();

      const stage = {
        ...EMPTY_ONSITE_STAGE,
        title: "Foundation",
        deliverable: "Poured concrete foundation",
        workingDays: 5,
        amountPaise: 2500000,
      };

      const draft = {
        ...EMPTY_ONSITE_DRAFT,
        stages: [stage],
      };

      await saveOnsiteDraft(invitationId, draft);
      const loaded = await loadOnsiteDraft(invitationId);

      expect(loaded).not.toBeNull();
      expect(loaded?.stages).toHaveLength(1);
      expect(loaded?.stages[0].title).toBe("Foundation");
      expect(loaded?.stages[0].amountPaise).toBe(2500000);

      await clearOnsiteDraft(invitationId);
      expect(await loadOnsiteDraft(invitationId)).toBeNull();
    });

    it("survives corrupt storage gracefully", async () => {
      await storageAdapter.setItem(`vsolve.m2.onsite-estimate.${invitationId}`, "corrupted payload");
      expect(await loadOnsiteDraft(invitationId)).toBeNull();
    });
  });
});
