import { describe, expect, it } from "vitest";

import { approvalTone, codeText, vehicleLabel } from "./layout";

describe("full words, never codes, on the Rides screens", () => {
  it("names each vehicle in full", () => {
    expect(vehicleLabel("BIKE")).toBe("Bike");
    expect(vehicleLabel("AUTO")).toBe("Auto");
    expect(vehicleLabel("CAB")).toBe("Cab");
    expect(vehicleLabel(null)).toBe("—");
  });

  it("turns a server code into plain words", () => {
    expect(codeText("APPROVED")).toBe("Approved");
    expect(codeText("PENDING_REVIEW")).toBe("Pending review");
    expect(codeText("rider")).toBe("Rider");
    expect(codeText("")).toBe("—");
  });

  it("colours an application by where it stands", () => {
    expect(approvalTone("APPROVED")).toBe("success");
    expect(approvalTone("PENDING_REVIEW")).toBe("warning");
    expect(approvalTone("REJECTED")).toBe("neutral");
  });
});
