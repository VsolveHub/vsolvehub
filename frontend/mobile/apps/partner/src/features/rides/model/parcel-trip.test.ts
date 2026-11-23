import {
  amountToCollect,
  buildingLine,
  callUrl,
  canMarkNotPaid,
  collectAtText,
  collectReason,
  isPinComplete,
  meetText,
  needsDeliveryPin,
  parcelProgress,
  parcelStateLabel,
  parcelStep,
  type ParcelRideLike,
} from "./parcel-trip";

function ride(state: string, extra: Partial<ParcelRideLike> = {}, parcel: Partial<NonNullable<ParcelRideLike["parcel"]>> = {}): ParcelRideLike {
  return {
    state,
    payment_status: "DUE",
    fare_paise: 5100,
    final_fare_paise: null,
    parcel: {
      payer: "SENDER",
      pin_required: true,
      arrived_at_drop_at: null,
      return_fare_paise: null,
      return_payment_status: null,
      ...parcel,
    },
    ...extra,
  };
}

describe("parcelStep: the way out", () => {
  it("follows the server's state up to the pickup code", () => {
    expect(parcelStep(ride("CAPTAIN_ASSIGNED"))).toBe("to_pickup");
    expect(parcelStep(ride("CAPTAIN_ARRIVED"))).toBe("pickup_code");
  });

  it("asks the sender for the money right after the pickup code", () => {
    expect(parcelStep(ride("IN_TRIP"))).toBe("collect_sender");
  });

  it("lets the captain carry on to the drop and collect later (the server allows it)", () => {
    expect(parcelStep(ride("IN_TRIP"), true)).toBe("to_drop");
  });

  it("goes straight to the drop when the sender has paid", () => {
    expect(parcelStep(ride("IN_TRIP", { payment_status: "COLLECTED" }))).toBe("to_drop");
  });

  it("goes straight to the drop when the receiver is to pay", () => {
    expect(parcelStep(ride("IN_TRIP", {}, { payer: "RECEIVER" }))).toBe("to_drop");
  });

  it("collects from the receiver first, before anything is handed over", () => {
    const atDrop = { payer: "RECEIVER", arrived_at_drop_at: "2026-11-23T10:00:00Z" };
    expect(parcelStep(ride("IN_TRIP", {}, atDrop))).toBe("collect_receiver");
    expect(parcelStep(ride("IN_TRIP", { payment_status: "COLLECTED" }, atDrop))).toBe("hand_over");
  });

  it("hands over once the captain is at the drop and nothing is owed there", () => {
    const atDrop = { arrived_at_drop_at: "2026-11-23T10:00:00Z" };
    expect(parcelStep(ride("IN_TRIP", { payment_status: "COLLECTED" }, atDrop))).toBe("hand_over");
    // A sender who has not paid is not the receiver's problem: hand over, collect later.
    expect(parcelStep(ride("IN_TRIP", {}, atDrop))).toBe("hand_over");
  });
});

describe("parcelStep: delivered, returning and returned", () => {
  it("keeps a delivered parcel on screen while the sender's fare is still due", () => {
    expect(parcelStep(ride("COMPLETED"))).toBe("collect_sender");
    expect(parcelStep(ride("COMPLETED", { payment_status: "COLLECTED" }))).toBe("done");
  });

  it("is on the way back while returning", () => {
    expect(parcelStep(ride("RETURNING"))).toBe("returning");
  });

  it("collects from the sender once the parcel is back, then is done", () => {
    const back = { return_fare_paise: 3000 };
    expect(parcelStep(ride("RETURNED", {}, { ...back, return_payment_status: "DUE" }))).toBe("collect_sender");
    expect(
      parcelStep(ride("RETURNED", { payment_status: "COLLECTED" }, { ...back, return_payment_status: "DUE" })),
    ).toBe("collect_sender");
    expect(
      parcelStep(ride("RETURNED", { payment_status: "COLLECTED" }, { ...back, return_payment_status: "COLLECTED" })),
    ).toBe("done");
    expect(
      parcelStep(ride("RETURNED", { payment_status: "UNPAID" }, { ...back, return_payment_status: "UNPAID" })),
    ).toBe("done");
  });

  it("is done for a cancelled or unknown state, and for a ride that is not a parcel", () => {
    expect(parcelStep(ride("CANCELLED"))).toBe("done");
    expect(parcelStep({ ...ride("IN_TRIP"), parcel: null })).toBe("done");
  });
});

describe("amountToCollect: always a number the server sent", () => {
  it("is the fixed fare on the way out", () => {
    expect(amountToCollect(ride("IN_TRIP", { final_fare_paise: 5300 }))).toBe(5300);
    expect(amountToCollect(ride("IN_TRIP"))).toBe(5100); // before the server has fixed it
  });

  it("is the whole job when the parcel is back and nothing was collected", () => {
    const due = ride("RETURNED", { final_fare_paise: 8100 }, { return_fare_paise: 3000, return_payment_status: "DUE" });
    expect(amountToCollect(due)).toBe(8100);
  });

  it("is only the return leg when the fare was collected at the pickup", () => {
    const due = ride(
      "RETURNED",
      { final_fare_paise: 8100, payment_status: "COLLECTED" },
      { return_fare_paise: 3000, return_payment_status: "DUE" },
    );
    expect(amountToCollect(due)).toBe(3000);
  });
});

describe("collectReason", () => {
  it("says what the money is for once the parcel is back", () => {
    const both = ride("RETURNED", {}, { return_payment_status: "DUE" });
    const returnOnly = ride("RETURNED", { payment_status: "COLLECTED" }, { return_payment_status: "DUE" });
    expect(collectReason(both)).toBe("The parcel fare and the return trip");
    expect(collectReason(returnOnly)).toBe("The return trip");
    expect(collectReason(ride("IN_TRIP"))).toBe("Cash or UPI to you");
  });

  it("allows Not paid only for a returned parcel", () => {
    expect(canMarkNotPaid(ride("RETURNED"))).toBe(true);
    for (const state of ["IN_TRIP", "RETURNING", "COMPLETED"]) expect(canMarkNotPaid(ride(state))).toBe(false);
  });
});

describe("hand over and the progress bar", () => {
  it("needs the PIN only when PIN confirmation is on", () => {
    expect(needsDeliveryPin(ride("IN_TRIP"))).toBe(true);
    expect(needsDeliveryPin(ride("IN_TRIP", {}, { pin_required: false }))).toBe(false);
  });

  it("accepts exactly four digits", () => {
    expect(isPinComplete("1234")).toBe(true);
    for (const bad of ["", "123", "12345", "12a4", "12 4"]) expect(isPinComplete(bad)).toBe(false);
  });

  it("shows the way out or the way back", () => {
    const out = parcelProgress(ride("IN_TRIP"), "to_drop");
    expect(out.labels).toEqual(["Pickup", "Code", "Drop", "Hand over", "Done"]);
    expect(out.at).toBe(2);
    expect(parcelProgress(ride("IN_TRIP"), "hand_over").at).toBe(3);
    const back = parcelProgress(ride("RETURNING"), "returning");
    expect(back.labels).toEqual(["Pickup", "Code", "Return", "Payment", "Done"]);
    expect(back.at).toBe(2);
    expect(parcelProgress(ride("RETURNED"), "collect_sender").at).toBe(3);
    expect(parcelProgress(ride("RETURNED"), "done").labels[2]).toBe("Return");
    expect(parcelProgress(ride("COMPLETED"), "done").labels[2]).toBe("Drop");
  });
});

describe("small helpers", () => {
  it("adds India's code to the 10 digits the server keeps", () => {
    expect(callUrl("9876543210")).toBe("tel:+919876543210");
  });

  it("says how to meet", () => {
    expect(meetText("DOOR")).toBe("Meet at door");
    expect(meetText("CURB")).toBe("Meet at curb");
  });

  it("joins the building and the unit, leaving out a blank one", () => {
    expect(buildingLine({ building: "Sky Towers", unit: "4B" })).toBe("Sky Towers · 4B");
    expect(buildingLine({ building: "Sky Towers", unit: " " })).toBe("Sky Towers");
    expect(buildingLine({ building: "", unit: "" })).toBe("");
  });

  it("says where to collect on the offer", () => {
    expect(collectAtText("PICKUP")).toBe("Collect at pickup");
    expect(collectAtText("DROP")).toBe("Collect at drop");
  });

  it("names the parcel states in lists", () => {
    expect(parcelStateLabel("COMPLETED")).toBe("Delivered");
    expect(parcelStateLabel("RETURNING")).toBe("Returning");
    expect(parcelStateLabel("RETURNED")).toBe("Returned");
    expect(parcelStateLabel("CANCELLED")).toBeNull();
  });
});
