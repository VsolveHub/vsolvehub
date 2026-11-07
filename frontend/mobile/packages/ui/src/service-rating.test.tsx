import { render } from "@testing-library/react-native";

import { ServiceRatingList } from "./service-rating";

describe("ServiceRatingList", () => {
  it("names the rater", async () => {
    const view = await render(
      <ServiceRatingList
        ratings={[
          {
            id: "1",
            rater_role: "CUSTOMER",
            score: 5,
            comment: "On time",
            created_at: "2026-01-01T00:00:00Z",
            is_mine: false,
          },
        ]}
      />,
    );
    expect(view.getByText("Customer rating")).toBeTruthy();
    expect(view.getByText("On time")).toBeTruthy();
  });
});
