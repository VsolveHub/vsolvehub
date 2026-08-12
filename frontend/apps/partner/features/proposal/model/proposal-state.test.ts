import { describe, expect, it } from "vitest";

import { proposal } from "@/features/enquiry/fixtures";
import type { EnquiryStatus } from "@/features/enquiry/model/enquiry-state";

import {
  UNREADABLE_PROPOSAL_NOTICE,
  describeProposalStatus,
  describeUsability,
  permissionsFor,
  resolveProposalView,
  type ProposalStatus,
} from "./proposal-state";

const ALL: ProposalStatus[] = [
  "SUBMITTED",
  "SUPERSEDED",
  "WITHDRAWN",
  "EXPIRED",
  "SELECTED",
  "REJECTED",
];

describe("withdrawing", () => {
  it("is offered from SUBMITTED only", () => {
    // `withdraw_proposal`: "Only a live quote can be withdrawn."
    const offered = ALL.filter(
      (status) =>
        permissionsFor({ proposal: proposal({ status }), enquiryStatus: "QUOTED" }).canWithdraw,
    );
    expect(offered).toEqual(["SUBMITTED"]);
  });
});

describe("revising", () => {
  it("needs the enquiry to still hold a slot", () => {
    const held: EnquiryStatus[] = ["ACCEPTED", "QUOTED"];
    const gone: EnquiryStatus[] = ["INVITED", "DECLINED", "EXPIRED", "WITHDRAWN"];

    for (const status of held) {
      expect(
        permissionsFor({ proposal: proposal(), enquiryStatus: status }).canSupersede,
      ).toBe(true);
    }
    for (const status of gone) {
      expect(
        permissionsFor({ proposal: proposal(), enquiryStatus: status }).canSupersede,
      ).toBe(false);
    }
  });

  it("is not offered once the customer has chosen", () => {
    // A "revision" after selection is a scope amendment on an engagement, which
    // is a different spine with a different approval.
    expect(
      permissionsFor({ proposal: proposal({ status: "SELECTED" }), enquiryStatus: "QUOTED" })
        .canSupersede,
    ).toBe(false);
  });
});

describe("status copy", () => {
  it("gives every status its own sentence", () => {
    expect(new Set(ALL.map((status) => describeProposalStatus(status).meaning)).size).toBe(
      ALL.length,
    );
  });

  it("says a superseded quote is kept rather than deleted", () => {
    // Proposals are append-only by construction: the customer can always see
    // what they were originally offered, and a dispute can be reconstructed.
    expect(describeProposalStatus("SUPERSEDED").meaning).toMatch(/never overwritten/i);
  });
});

describe("usability", () => {
  it("says nothing when a quote is usable", () => {
    expect(describeUsability("USABLE")).toBeNull();
  });

  it("labels an over-budget quote without calling it a failure", () => {
    // `classify_usability` labels rather than hides, so the customer decides.
    const copy = describeUsability("OUT_OF_BUDGET");
    expect(copy).toMatch(/They can still choose it/i);
    expect(copy).not.toMatch(/rejected|refused/i);
  });

  it("handles a value the current classifier never produces", () => {
    // INCOMPLETE is published in the enum. A screen that crashes on a value the
    // server can legally send is worse than one that renders it plainly.
    expect(describeUsability("INCOMPLETE")).not.toBeNull();
  });
});

describe("finding the quote after a reload", () => {
  it("offers the composer when nothing has been quoted", () => {
    expect(resolveProposalView({ enquiryStatus: "ACCEPTED", proposal: null })).toEqual({
      kind: "none",
    });
  });

  it("shows the record this session holds", () => {
    const record = proposal();
    expect(resolveProposalView({ enquiryStatus: "QUOTED", proposal: record })).toEqual({
      kind: "known",
      proposal: record,
    });
  });

  it("admits it cannot read the quote back once the id is gone", () => {
    // There is no list read for a Partner's own proposals: contract 1.21.0
    // publishes submit, read-by-id and withdraw, and `EnquiryDetail` carries no
    // proposal. After a refresh the only readable truth is that the invitation
    // is QUOTED.
    expect(resolveProposalView({ enquiryStatus: "QUOTED", proposal: null })).toEqual({
      kind: "unreadable",
    });
  });

  it("tells the vendor plainly rather than showing an empty quote", () => {
    expect(UNREADABLE_PROPOSAL_NOTICE).toMatch(/cannot show you the quote itself/i);
    expect(UNREADABLE_PROPOSAL_NOTICE).toMatch(/replaces whatever is with the customer/i);
  });
});
