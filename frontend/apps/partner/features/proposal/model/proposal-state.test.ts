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

  it("never offers a revision after the customer turns an estimate down", () => {
    expect(
      permissionsFor({
        proposal: proposal({ status: "REJECTED" }),
        enquiryStatus: "QUOTED",
        documentKind: "estimate",
      }).canSupersede,
    ).toBe(false);
  });

  it("leaves a live estimate revisable however long ago it was sent", () => {
    // There is no clock left in this policy. Until 1.61.0 an estimate closed to
    // revision five minutes after submission, which is how a vendor ended up
    // staring at a price they could not correct while the customer was still
    // deciding. `submitted_at` is deliberately ancient here: if a window ever
    // creeps back in, this is the test that fails.
    expect(
      permissionsFor({
        proposal: proposal({ status: "SUBMITTED", submitted_at: "2020-01-01T00:00:00Z" }),
        enquiryStatus: "QUOTED",
        documentKind: "estimate",
      }).canSupersede,
    ).toBe(true);
  });

  it("lets a withdrawn estimate be replaced, because the withdraw dialog says so", () => {
    // "Your enquiry stays open, so you can send a new one." That sentence is on
    // the confirm step for both document kinds, and the server takes the
    // submission — so the control has to be there for both too.
    for (const documentKind of ["quote", "estimate"] as const) {
      expect(
        permissionsFor({
          proposal: proposal({ status: "WITHDRAWN" }),
          enquiryStatus: "QUOTED",
          documentKind,
        }).canSupersede,
      ).toBe(true);
    }
  });

  it("reopens an expired estimate only once the customer asks whether it still stands", () => {
    // `_assert_project_revision_allowed` allows exactly this one expired case,
    // and `revalidationNoticeFor` tells the vendor a revision is "the only way
    // to say yes". Without the ask there is nothing to answer.
    const expired = proposal({ status: "EXPIRED" });

    expect(
      permissionsFor({ proposal: expired, enquiryStatus: "QUOTED", documentKind: "estimate" })
        .canSupersede,
    ).toBe(false);
    expect(
      permissionsFor({
        proposal: proposal({
          status: "EXPIRED",
          revalidation_requested_at: "2026-08-12T08:05:00Z",
        }),
        enquiryStatus: "QUOTED",
        documentKind: "estimate",
      }).canSupersede,
    ).toBe(true);
  });

  it("keeps an estimate the customer settled immutable", () => {
    for (const status of ["SELECTED", "ACCEPTED", "LAPSED", "REJECTED"] as const) {
      expect(
        permissionsFor({
          proposal: proposal({ status }),
          enquiryStatus: "QUOTED",
          documentKind: "estimate",
        }).canSupersede,
      ).toBe(false);
    }
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
    expect(UNREADABLE_PROPOSAL_NOTICE).toMatch(/could not load the quote itself/i);
    expect(UNREADABLE_PROPOSAL_NOTICE).toMatch(/replaces whatever is with them/i);
  });
});
