import { fireEvent, render } from "@testing-library/react-native";

import type { PartnerApplication } from "../model";
import { ApplicantCard } from "./applicant-card";

/**
 * Which actions the employer sees for each applicant stage: the same rules as the website's
 * applicant card. Regression: the phone had no Shortlist at all, and showed "Mark connected" and
 * "Not selected" on every applicant, even closed ones.
 */

function app(status: PartnerApplication["status"]): PartnerApplication {
  return { id: "a-1", status, applicant_name: "Ravi" } as PartnerApplication;
}

async function renderCard(status: PartnerApplication["status"], onUpdateStatus = jest.fn()) {
  const view = await render(
    <ApplicantCard
      application={app(status)}
      onUpdateStatus={onUpdateStatus}
      onRevealContact={jest.fn()}
      onScheduleInterview={jest.fn()}
    />,
  );
  return { view, onUpdateStatus };
}

describe("ApplicantCard actions", () => {
  it("offers Shortlist on a new applicant, and it shortlists", async () => {
    const { view, onUpdateStatus } = await renderCard("SUBMITTED");
    fireEvent.press(view.getByRole("button", { name: "Shortlist" }));
    expect(onUpdateStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "a-1" }), "SHORTLISTED");
    expect(view.getByText("Schedule interview")).toBeTruthy();
    expect(view.getByText("Not selected")).toBeTruthy();
    expect(view.queryByText("Mark connected")).toBeNull();
  });

  it("offers Mark connected only after an interview", async () => {
    const { view } = await renderCard("INTERVIEW");
    expect(view.getByText("Mark connected")).toBeTruthy();
    expect(view.queryByText("Shortlist")).toBeNull();
  });

  it.each(["REJECTED", "WITHDRAWN", "EXPIRED"] as const)("offers no stage actions on a closed (%s) applicant", async (status) => {
    const { view } = await renderCard(status);
    for (const label of ["Shortlist", "Schedule interview", "Mark connected", "Not selected"]) {
      expect(view.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("offers no further stage actions once connected", async () => {
    const { view } = await renderCard("CONNECTED");
    for (const label of ["Shortlist", "Schedule interview", "Mark connected", "Not selected"]) {
      expect(view.queryByRole("button", { name: label })).toBeNull();
    }
  });
});
