import {
  canConfirm,
  emptyEnd,
  guidelineLimits,
  initialDraft,
  isEndComplete,
  isPhoneValid,
  limitsText,
  meetLabel,
  parcelCopy,
  parcelStageLabel,
  paymentNote,
  payerLine,
  placeLine,
  shareableCodes,
  tenDigits,
  toRequest,
  withEnd,
  withMode,
  withPayer,
  withPinRequired,
  type Booker,
  type ParcelEnd,
  type ParcelRideLike,
} from "./model";

const BOOKER: Booker = { name: "Priya Sharma", phone: "+919123456780" };
const RECEIVER: ParcelEnd = { ...emptyEnd("drop"), name: "Asha Rao", phone: "9876543210" };

describe("the starting draft (D7, D9, D10)", () => {
  it("is sending, the sender pays, PIN confirmation on, and the booker at the pickup", () => {
    const draft = initialDraft(BOOKER);

    expect(draft.mode).toBe("SEND");
    expect(draft.payer).toBe("SENDER");
    expect(draft.pinRequired).toBe(true);
    expect(draft.pickup).toMatchObject({ name: "Priya Sharma", phone: "9123456780", meet_at: "CURB" });
    expect(draft.drop).toMatchObject({ name: "", phone: "", meet_at: "DOOR" });
  });

  it("takes the last 10 digits of whatever phone format the account has", () => {
    expect(tenDigits("+91 91234 56780")).toBe("9123456780");
    expect(tenDigits("9123456780")).toBe("9123456780");
  });
});

describe("I'm sending / I'm receiving", () => {
  it("moves the booker's details to the drop and leaves the pickup to be added", () => {
    const receiving = withMode(initialDraft(BOOKER), "RECEIVE", BOOKER);

    expect(receiving.drop).toMatchObject({ name: "Priya Sharma", phone: "9123456780" });
    expect(receiving.pickup).toMatchObject({ name: "", phone: "" });
  });

  it("brings them back to the pickup when switched back", () => {
    const back = withMode(withMode(initialDraft(BOOKER), "RECEIVE", BOOKER), "SEND", BOOKER);

    expect(back.pickup).toMatchObject({ name: "Priya Sharma", phone: "9123456780" });
    expect(back.drop).toMatchObject({ name: "", phone: "" });
  });

  it("keeps what the booker typed for the other person", () => {
    const withReceiver = withEnd(initialDraft(BOOKER), "drop", RECEIVER);

    const receiving = withMode(withReceiver, "RECEIVE", BOOKER);

    // The receiver's details are not thrown away; the booker's own end is only moved.
    expect(receiving.drop).toMatchObject({ name: "Asha Rao" });
    expect(receiving.pickup).toMatchObject({ name: "", phone: "" });
  });

  it("does not wipe a pickup the booker edited with a building", () => {
    const edited = withEnd(initialDraft(BOOKER), "pickup", { ...initialDraft(BOOKER).pickup, building: "Sky Towers" });

    expect(withMode(edited, "RECEIVE", BOOKER).pickup.building).toBe("Sky Towers");
  });

  it("is the same draft when nothing changes", () => {
    const draft = initialDraft(BOOKER);
    expect(withMode(draft, "SEND", BOOKER)).toBe(draft);
  });
});

describe("who pays (D9)", () => {
  it("follows sending or receiving until the booker switches it", () => {
    const sending = initialDraft(BOOKER);
    expect(sending.payer).toBe("SENDER");
    expect(withMode(sending, "RECEIVE", BOOKER).payer).toBe("RECEIVER");
    expect(withMode(withMode(sending, "RECEIVE", BOOKER), "SEND", BOOKER).payer).toBe("SENDER");
  });

  it("stays where the booker put it, whatever they toggle after", () => {
    const chosen = withPayer(initialDraft(BOOKER), "RECEIVER");

    expect(chosen.payer).toBe("RECEIVER");
    expect(withMode(chosen, "RECEIVE", BOOKER).payer).toBe("RECEIVER");
    expect(withMode(withPayer(initialDraft(BOOKER), "SENDER"), "RECEIVE", BOOKER).payer).toBe("SENDER");
  });

  it("says where the money is paid, with the server's fare", () => {
    expect(payerLine("SENDER", "₹51")).toBe("Sender pays ₹51 in cash or UPI to the captain at the pickup");
    expect(payerLine("RECEIVER", "₹51")).toBe("Receiver pays ₹51 in cash or UPI to the captain at the drop");
  });
});

describe("when Confirm works (D8)", () => {
  it("needs a name and a valid phone at both ends", () => {
    const draft = initialDraft(BOOKER);
    expect(canConfirm(draft)).toBe(false); // the drop is empty

    const ready = withEnd(draft, "drop", RECEIVER);
    expect(canConfirm(ready)).toBe(true);
    expect(canConfirm(withEnd(ready, "drop", { ...RECEIVER, name: "  " }))).toBe(false);
    expect(canConfirm(withEnd(ready, "drop", { ...RECEIVER, phone: "98765" }))).toBe(false);
    expect(canConfirm(withEnd(ready, "pickup", emptyEnd("pickup")))).toBe(false);
  });

  it("accepts a 10-digit mobile that starts 6 to 9, as the server does", () => {
    for (const ok of ["9876543210", "6000000000"]) expect(isPhoneValid(ok)).toBe(true);
    for (const bad of ["5876543210", "987654321", "98765432100", "98765 43210", "+919876543210", ""]) {
      expect(isPhoneValid(bad)).toBe(false);
    }
    expect(isEndComplete(RECEIVER)).toBe(true);
  });

  it("is not blocked by the optional fields", () => {
    expect(isEndComplete({ ...RECEIVER, building: "", unit: "", instructions: "" })).toBe(true);
  });
});

describe("the booking request", () => {
  it("carries every choice, trimmed", () => {
    const draft = withPinRequired(
      withEnd(initialDraft(BOOKER), "drop", { ...RECEIVER, name: "  Asha Rao ", building: " Green Villas ", instructions: " Ring twice " }),
      false,
    );

    expect(toRequest(withPayer(draft, "RECEIVER"))).toEqual({
      mode: "SEND",
      payer: "RECEIVER",
      pin_required: false,
      pickup: { name: "Priya Sharma", phone: "9123456780", building: "", unit: "", meet_at: "CURB", instructions: "" },
      drop: {
        name: "Asha Rao",
        phone: "9876543210",
        building: "Green Villas",
        unit: "",
        meet_at: "DOOR",
        instructions: "Ring twice",
      },
    });
  });
});

describe("limits and guidelines", () => {
  it("shows the server's limits in kilograms", () => {
    expect(limitsText({ max_weight_grams: 10_000, size_label: "40 x 30 x 20 cm" })).toBe("Up to 10 kg · 40 x 30 x 20 cm");
    expect(limitsText({ max_weight_grams: 7_500, size_label: "small" })).toBe("Up to 7.5 kg · small");
    expect(limitsText({ max_weight_grams: null, size_label: "" })).toBe("");
  });

  it("lists each vehicle's limits for the guidelines", () => {
    const quotes = [
      { vehicle_type: "BIKE", max_weight_grams: 10_000, size_label: "40 x 30 x 20 cm" },
      { vehicle_type: "AUTO", max_weight_grams: 50_000, size_label: "1.3 x 3.5 x 3.3 ft" },
    ];

    expect(guidelineLimits(quotes, (type) => (type === "BIKE" ? "Bike" : "Auto"))).toEqual([
      "Bike: Up to 10 kg · 40 x 30 x 20 cm",
      "Auto: Up to 50 kg · 1.3 x 3.5 x 3.3 ft",
    ]);
  });

  it("describes how to meet and where", () => {
    expect(meetLabel("DOOR")).toBe("Meet at door");
    expect(meetLabel("CURB")).toBe("Meet at curb");
    expect(placeLine({ building: "Sky Towers", unit: "4B" })).toBe("Sky Towers · 4B");
    expect(placeLine({ building: "", unit: " 4B " })).toBe("4B");
  });
});

describe("the tracking stages (§5.2 item 6)", () => {
  const stage = (state: string, arrived: string | null = null) =>
    parcelStageLabel({ state, parcel: { payer: "SENDER", arrived_at_drop_at: arrived, delivery_pin: null } });

  it("names every stage", () => {
    expect(stage("SEARCHING")).toBe("Finding a captain");
    expect(stage("CAPTAIN_ASSIGNED")).toBe("Captain on the way");
    expect(stage("CAPTAIN_ARRIVED")).toBe("At pickup");
    expect(stage("IN_TRIP")).toBe("Picked up");
    expect(stage("IN_TRIP", "2026-11-23T10:00:00Z")).toBe("At drop");
    expect(stage("COMPLETED")).toBe("Delivered");
    expect(stage("RETURNING")).toBe("Returning");
    expect(stage("RETURNED")).toBe("Returned");
    expect(stage("CANCELLED")).toBe("Cancelled");
    expect(stage("NO_CAPTAIN_FOUND")).toBe("No captain found");
  });
});

describe("the codes card and Share (D10)", () => {
  const ride = (extra: Partial<ParcelRideLike> = {}, parcel: Partial<NonNullable<ParcelRideLike["parcel"]>> = {}): ParcelRideLike => ({
    state: "CAPTAIN_ASSIGNED",
    otp: "4821",
    fare_paise: 5100,
    final_fare_paise: null,
    captain: { name: "Ravi Kumar", vehicle: { registration_number: "TS09AB1234", make_model: "Honda Shine" } },
    parcel: { payer: "SENDER", arrived_at_drop_at: null, delivery_pin: "7305", ...parcel },
    ...extra,
  });

  it("lists the pickup code and the delivery PIN, each with who it is for", () => {
    const codes = shareableCodes(ride(), "₹51");

    expect(codes.map((c) => [c.key, c.title, c.code])).toEqual([
      ["pickup", "Pickup code", "4821"],
      ["pin", "Delivery PIN", "7305"],
    ]);
    expect(codes[0]?.forWhom).toMatch(/pickup/);
    expect(codes[1]?.forWhom).toMatch(/receiver/);
  });

  it("shares the captain, the vehicle and the code, in the brief's words", () => {
    const [pickup, pin] = shareableCodes(ride(), "₹51");

    expect(pickup?.shareText).toBe("V Solve Hub Pick up & Drop: Ravi Kumar, Honda Shine TS09AB1234. Pickup code 4821");
    expect(pin?.shareText).toBe("V Solve Hub Pick up & Drop: Ravi Kumar, Honda Shine TS09AB1234. Delivery PIN 7305");
  });

  it("asks the receiver to pay first when the receiver pays", () => {
    const [, pin] = shareableCodes(ride({}, { payer: "RECEIVER" }), "₹51");

    expect(pin?.shareText).toBe(
      "V Solve Hub Pick up & Drop: Ravi Kumar, Honda Shine TS09AB1234. Delivery PIN 7305. " +
        "Please pay ₹51 in cash or UPI to the captain before you take the item.",
    );
  });

  it("lists only what the server sends: no PIN when PIN confirmation is off", () => {
    const codes = shareableCodes(ride({}, { delivery_pin: null }), "₹51");

    expect(codes.map((c) => c.key)).toEqual(["pickup"]);
  });

  it("lists no pickup code once the parcel is on its way, and no PIN after delivery", () => {
    expect(shareableCodes(ride({ state: "IN_TRIP", otp: null }), "₹51").map((c) => c.key)).toEqual(["pin"]);
    expect(shareableCodes(ride({ state: "COMPLETED", otp: null }, { delivery_pin: null }), "₹51")).toEqual([]);
  });

  it("shows the pickup code again on the way back, for taking the parcel back", () => {
    const [code] = shareableCodes(ride({ state: "RETURNING" }, { delivery_pin: null }), "₹51");

    expect(code?.key).toBe("pickup");
    expect(code?.forWhom).toMatch(/take the parcel back/);
  });

  it("still names the service before a captain is found", () => {
    const [pickup] = shareableCodes(ride({ captain: null }), "₹51");

    expect(pickup?.shareText).toBe("V Solve Hub Pick up & Drop. Pickup code 4821");
  });
});

describe("what the tracking screen says (§5.2 item 6)", () => {
  const copy = (state: string, extra: Record<string, unknown> = {}, arrived: string | null = null) =>
    parcelCopy(
      { state, cancelled_by: "", cancel_reason: "", searching_again: false, parcel: { arrived_at_drop_at: arrived }, ...extra },
      "Ravi",
    );

  it("names the captain while they come", () => {
    expect(copy("CAPTAIN_ASSIGNED").headline).toBe("Ravi is on the way");
    expect(copy("CAPTAIN_ARRIVED").headline).toBe("Ravi has arrived");
  });

  it("says it is looking again after a captain cancels", () => {
    expect(copy("SEARCHING").headline).toBe("Finding your captain…");
    expect(copy("SEARCHING", { searching_again: true }).headline).toBe("Finding another captain…");
  });

  it("follows the parcel to the drop, back, and home", () => {
    expect(copy("IN_TRIP").headline).toBe("Your parcel is on its way");
    expect(copy("IN_TRIP", {}, "2026-11-23T10:00:00Z").headline).toBe("Your parcel is at the drop");
    expect(copy("COMPLETED").headline).toBe("Parcel delivered");
    expect(copy("RETURNING").headline).toBe("Your parcel is coming back");
    expect(copy("RETURNED").headline).toBe("Parcel returned");
  });

  it("says why a cancelled parcel ended, and that a refused item costs nothing", () => {
    expect(copy("CANCELLED", { cancel_reason: "ITEM_NOT_ALLOWED", cancelled_by: "CAPTAIN" }).detail).toMatch(/You were not charged/);
    expect(copy("CANCELLED", { cancelled_by: "RIDER" }).detail).toBe("You cancelled this parcel.");
    expect(copy("CANCELLED", { cancelled_by: "OPERATIONS" }).detail).toBe("VSolve support cancelled this parcel.");
    expect(copy("CANCELLED").detail).toBe("This parcel was cancelled.");
  });

  it("says who pays the captain, and where", () => {
    expect(paymentNote("SENDER")).toBe("Sender pays the captain at the pickup");
    expect(paymentNote("RECEIVER")).toBe("Receiver pays the captain at the drop");
  });
});
