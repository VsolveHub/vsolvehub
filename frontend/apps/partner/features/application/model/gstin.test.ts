import { describe, expect, it } from "vitest";

import { checkGstin, gstinCheckChar } from "./gstin";

/** The same samples and cases as `backend/tests/partners/test_gstin.py`. */
const SAMPLES = ["27AAPFU0939F1ZV", "29AAGCB7383J1Z4"];

describe("checking a GSTIN", () => {
  it.each(SAMPLES)("accepts the public sample %s", (gstin) => {
    expect(checkGstin(gstin)).toEqual({ ok: true, gstin });
  });

  it("works out the check character of each sample", () => {
    for (const gstin of SAMPLES) {
      expect(gstinCheckChar(gstin.slice(0, 14))).toBe(gstin[14]);
    }
  });

  it("ignores case and spaces and returns the normalised number", () => {
    expect(checkGstin(" 27aapfu0939f1zv ")).toEqual({ ok: true, gstin: "27AAPFU0939F1ZV" });
  });

  it("refuses a wrong check character", () => {
    expect(checkGstin("27AAPFU0939F1ZW")).toEqual({ ok: false, problem: "checksum" });
  });

  it.each(["", "27AAPFU0939F1Z", "27AAPFU0939F1ZVV", "27AAPFU0939F1Z-"])(
    "refuses a wrong length or character: %j",
    (raw) => {
      expect(checkGstin(raw)).toEqual({ ok: false, problem: "format" });
    },
  );

  it("refuses an unknown state code", () => {
    expect(checkGstin("00AAPFU0939F1ZV")).toEqual({ ok: false, problem: "state" });
  });

  it("refuses a business PAN that is not shaped like one", () => {
    expect(checkGstin("2711111111111ZV")).toEqual({ ok: false, problem: "pan" });
  });

  it("refuses an entity number of zero", () => {
    expect(checkGstin("27AAPFU0939F0ZV")).toEqual({ ok: false, problem: "format" });
  });
});
