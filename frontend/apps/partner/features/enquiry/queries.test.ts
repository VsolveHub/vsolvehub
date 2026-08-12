import { describe, expect, it } from "vitest";

import { enquirySummary } from "./fixtures";
import { readEnquiryPage } from "./queries";

/**
 * The list seam, where the contract and the server disagree.
 *
 * `m2_partner_enquiry_list` is declared in `v1.yaml` as a bare
 * `EnquirySummary[]`. `PartnerEnquiryCollectionView.get` returns
 * `EnquiryCursorPagination.get_paginated_response(...)`, which is
 * `{next, previous, results}`.
 *
 * So the generated type is wrong about the shape of a real response, and code
 * written against it — `data.map(...)` — throws on the first request rather than
 * failing a type check. This function accepts both shapes, and these tests are
 * what will still pass on the day the contract is corrected and the envelope
 * becomes the only shape.
 */

describe("reading a list response", () => {
  it("reads the page envelope Django actually sends", () => {
    const page = readEnquiryPage({
      next: "https://api.example.test/api/v1/partner/enquiries/?cursor=cD0y",
      previous: null,
      results: [enquirySummary()],
    });

    expect(page.results).toHaveLength(1);
    expect(page.next).toBe("https://api.example.test/api/v1/partner/enquiries/?cursor=cD0y");
  });

  it("reads the bare array the contract declares", () => {
    const page = readEnquiryPage([enquirySummary()]);
    expect(page.results).toHaveLength(1);
    // A bare array has no further page by definition, so nothing can be
    // silently truncated behind it.
    expect(page.next).toBeNull();
  });

  it("reads an empty inbox as empty rather than as a failure", () => {
    expect(readEnquiryPage({ next: null, previous: null, results: [] }).results).toEqual([]);
    expect(readEnquiryPage([]).results).toEqual([]);
  });

  it("treats a non-string next link as no further page", () => {
    expect(readEnquiryPage({ next: 7, results: [] }).next).toBeNull();
  });

  it("fails loudly on a shape it does not recognise", () => {
    // The one wrong answer is an empty list, which renders as "you have no
    // enquiries" — a vendor would stop looking. A thrown error reaches the
    // screen's real error state instead.
    expect(() => readEnquiryPage({ items: [] })).toThrow(TypeError);
    expect(() => readEnquiryPage(null)).toThrow(TypeError);
    expect(() => readEnquiryPage("nothing")).toThrow(TypeError);
  });
});
