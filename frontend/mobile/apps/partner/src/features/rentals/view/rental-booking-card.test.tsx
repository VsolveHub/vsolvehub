import { render } from "@testing-library/react-native";
import type { PartnerRentalBooking } from "../model";
import { RentalBookingCard } from "./rental-booking-card";

describe("RentalBookingCard", () => {
  const baseBooking: PartnerRentalBooking = {
    id: "booking-123",
    booking_code: "E109F234",
    status: "PENDING_PAYMENT",
    asset: {
      id: "asset-1",
      title: "Waterproof Pagoda Tent 20×20 ft (Outdoor Events)",
      daily_rate_paise: 249900,
      deposit_paise: 800000,
      status: "ACTIVE",
    },
    customer_name: "Demo Rental Customer",
    customer_phone: "+919876543210",
    start_date: "2026-11-22",
    end_date: "2026-11-24",
    quantity: 1,
    price_paise: 499800,
    platform_fee_paise: 0,
    deposit_paise: 800000,
    created_at: "2026-11-20T10:00:00Z",
  };

  it("renders order code, title, customer name, and full status badge", async () => {
    const view = await render(<RentalBookingCard booking={baseBooking} />);

    expect(view.getByText("Order #E109F234")).toBeTruthy();
    expect(view.getByText("Waterproof Pagoda Tent 20×20 ft (Outdoor Events)")).toBeTruthy();
    expect(view.getByText("Demo Rental Customer")).toBeTruthy();
    expect(view.getByText("Pending Payment")).toBeTruthy();
    expect(view.getByText("Call Renter")).toBeTruthy();
    expect(view.getByText("₹4,998")).toBeTruthy();
    expect(view.getByText("₹8,000")).toBeTruthy();
    expect(view.getByText("View booking")).toBeTruthy();
  });
});
