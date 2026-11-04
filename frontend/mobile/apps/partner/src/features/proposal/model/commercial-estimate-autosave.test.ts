import {
  EMPTY_COMMERCIAL_ESTIMATE,
  clearCommercialEstimate,
  loadCommercialEstimate,
  parseCommercialEstimate,
  saveCommercialEstimate,
  type CommercialEstimateDraft,
} from "./commercial-estimate-draft";

// The vendor's half-written estimate survives the app closing. The web version wrote to
// `window.localStorage`, which a phone does not have, so on a phone nothing was ever kept.
describe("commercial estimate autosave", () => {
  const draft: CommercialEstimateDraft = { ...EMPTY_COMMERCIAL_ESTIMATE, scopeSummary: "Two coats, primer included" };

  it("loads back exactly what was saved", async () => {
    await saveCommercialEstimate("inv-1", draft);
    expect(await loadCommercialEstimate("inv-1")).toEqual(expect.objectContaining({ scopeSummary: "Two coats, primer included" }));
  });

  it("keeps each enquiry's draft apart", async () => {
    await saveCommercialEstimate("inv-a", { ...draft, scopeSummary: "A" });
    await saveCommercialEstimate("inv-b", { ...draft, scopeSummary: "B" });
    expect((await loadCommercialEstimate("inv-a"))?.scopeSummary).toBe("A");
    expect((await loadCommercialEstimate("inv-b"))?.scopeSummary).toBe("B");
  });

  it("forgets a draft once cleared", async () => {
    await saveCommercialEstimate("inv-2", draft);
    await clearCommercialEstimate("inv-2");
    expect(await loadCommercialEstimate("inv-2")).toBeNull();
  });

  it("has nothing for an enquiry never drafted", async () => {
    expect(await loadCommercialEstimate("inv-never")).toBeNull();
  });
});

describe("a stored draft is untrusted input", () => {
  it("rejects anything that is not a draft", () => {
    expect(parseCommercialEstimate("not json")).toBeNull();
    expect(parseCommercialEstimate('{"itemLines": "nope"}')).toBeNull();
  });

  it("marks a typed row with no catalogue id as custom, as older drafts never said", () => {
    const old = {
      ...EMPTY_COMMERCIAL_ESTIMATE,
      itemLines: [{ ...({} as CommercialEstimateDraft["itemLines"][number]), title: "Wall putty", workItemId: undefined, isCustom: undefined }],
    };
    const parsed = parseCommercialEstimate(JSON.stringify(old));
    expect(parsed?.itemLines[0]).toEqual(expect.objectContaining({ workItemId: null, isCustom: true }));
  });
});
