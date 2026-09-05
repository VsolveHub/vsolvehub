import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { enquiryDetail } from "../fixtures";
import { readEnquiryRecord } from "../model/wire";
import { RequirementSummary } from "./requirement-summary";

/**
 * The brief renders as the server labelled it (1.48.0) — question and value —
 * and never as a de-slugged answer code. An empty brief is one honest line.
 */
describe("the customer's brief", () => {
  it("renders each question with the label the customer chose", () => {
    const enquiry = readEnquiryRecord(
      enquiryDetail({
        brief: [
          { code: "symptom", question: "What is wrong", value: "Power keeps tripping" },
          { code: "rooms", question: "How big", value: "2 BHK" },
        ],
      }),
    );
    render(<RequirementSummary enquiry={enquiry} />);

    expect(screen.getByText("What is wrong")).toBeInTheDocument();
    expect(screen.getByText("Power keeps tripping")).toBeInTheDocument();
    expect(screen.getByText("2 BHK")).toBeInTheDocument();
    // The raw answer map is not paraphrased any more.
    expect(screen.queryByText("Site access")).not.toBeInTheDocument();
    expect(screen.queryByText(/in their own words/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/photos or voice notes/i)).not.toBeInTheDocument();
  });

  it("says the details are the vendor's to take when the brief is empty", () => {
    const enquiry = readEnquiryRecord(enquiryDetail({ brief: [] }));
    render(<RequirementSummary enquiry={enquiry} />);

    expect(
      screen.getByText(/chose the service and a visit time — the details are yours to take on site/i),
    ).toBeInTheDocument();
  });
});
