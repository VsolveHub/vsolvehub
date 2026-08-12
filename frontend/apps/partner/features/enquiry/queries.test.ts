import { describe, expect, it } from "vitest";

import { enquirySummary } from "./fixtures";
import { readEnquiryPage } from "./queries";

/**
 * The list seam, where the contract and the server used to disagree.
 *
 * `m2_partner_enquiry_list` was declared in `v1.yaml` as a bare
 * `EnquirySummary[]` while `PartnerEnquiryCollectionView.get` returned
 * `EnquiryCursorPagination.get_paginated_response(...)`, i.e.
 * `{next, previous, results}` — so the generated type was wrong about the shape
 * of a real response and `data.map(...)` threw on the first request rather than
 * failing a type check.
 *
 * **Contract 1.23.0 declares `EnquirySummaryPage`.** The bare-array and
 * unrecognisable-shape cases are deleted with the branches they covered: the
 * envelope is now the only shape and `results` is required. What is still worth
 * asserting is the projection down to the two fields the inbox uses, because
 * `next` surviving non-null is what keeps the truncation notice honest.
 */

describe("reading a list response", () => {
  it("reads the page envelope Django sends", () => {
    const page = readEnquiryPage({
      next: "https://api.example.test/api/v1/partner/enquiries/?cursor=cD0y",
      previous: null,
      results: [enquirySummary()],
    });

    expect(page.results).toHaveLength(1);
    expect(page.next).toBe("https://api.example.test/api/v1/partner/enquiries/?cursor=cD0y");
  });

  it("reads an empty inbox as empty rather than as a failure", () => {
    expect(readEnquiryPage({ next: null, previous: null, results: [] }).results).toEqual([]);
  });

  it("carries a null next link through as no further page", () => {
    expect(readEnquiryPage({ next: null, previous: null, results: [] }).next).toBeNull();
  });
});
