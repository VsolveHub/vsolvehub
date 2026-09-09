import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createStayHold = vi.hoisted(() => vi.fn());
const fetchStayBrowse = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => ({ unitTypeId: "ut-shared-1" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/session/queries", () => ({
  useCustomerSession: () => ({
    isResolving: false,
    isAuthenticated: true,
    isAnonymous: false,
    isUnavailable: false,
    userId: "customer-1",
    phoneNumber: "+919876543210",
    displayName: "Gopal",
    fullName: "Gopal Rao",
    email: "gopal@example.test",
    dateJoined: "2026-01-12T08:30:00Z",
    activeRole: "customer",
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/account/queries", () => ({
  useCustomerProfile: () => ({
    data: {
      id: "customer-1",
      phone_number: "+919876543210",
      display_name: "Gopal",
      full_name: "Gopal Rao",
      email: "gopal@example.test",
    },
  }),
}));

vi.mock("@/features/payment/model/provider-handoff", () => ({
  handoffTarget: vi.fn(),
  openProviderCheckout: vi.fn(),
}));

vi.mock("@/features/stays/queries", () => ({
  fetchStayBrowse,
  createStayHold,
  fetchPaymentAttempt: vi.fn(),
  fetchStayReservation: vi.fn(),
  releaseStayHold: vi.fn(),
  simulateStayPayment: vi.fn(),
  startStayPayment: vi.fn(),
}));

const sharedCard = {
  unit_type_id: "ut-shared-1",
  property_id: "prop-1",
  property_title: "Kondapur PG",
  property_type: "PG",
  property_type_display: "PG",
  occupancy_model: "SHARED",
  locality: "Kondapur",
  rating: 4.2,
  reviews_count: 12,
  unit_name: "Single occupancy bed",
  sharing_type: "PRIVATE",
  sharing_display: "1 Sharing",
  sharing_count: 1,
  is_ac: true,
  bathroom_type: "ATTACHED",
  furnishing_status: "FULLY_FURNISHED",
  furnishing_display: "Furnished",
  food_included: true,
  bhk: "",
  occupancy_capacity: 1,
  bathrooms: 1,
  built_up_sqft: 120,
  facing: "East",
  floor: "2",
  amenities: [],
  image_url: "",
  price_paise: 1200000,
  price_per_month: 12000,
  deposit_paise: 2400000,
  maintenance_paise: 0,
  duration_mode: "MONTHLY",
  supported_duration_modes: ["MONTHLY"],
  total_units: 4,
  units_available: 2,
  host_name: "Host",
  host_verified: true,
};

const StayCheckoutPage = (await import("../../app/(flow)/stays/checkout/[unitTypeId]/page")).default;

beforeEach(() => {
  vi.clearAllMocks();
  fetchStayBrowse.mockResolvedValue([sharedCard]);
  createStayHold.mockResolvedValue({
    id: "hold-1",
    status: "HELD",
    base_amount_paise: 1200000,
    maintenance_amount_paise: 0,
    deposit_amount_paise: 2400000,
    one_time_charges_paise: 0,
    tax_amount_paise: 0,
    total_amount_paise: 3600000,
  });
});

describe("Stay checkout simplification", () => {
  it("hides occupants on SHARED, omits unpublished duration tabs, and holds guest_count 1", async () => {
    render(<StayCheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/kondapur pg/i)).toBeInTheDocument();
    });

    expect(screen.queryByTestId("stay-occupant-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stay-duration-toggle")).not.toBeInTheDocument();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByText(/gopal rao/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/emergency contact name/i), {
      target: { value: "Priya" },
    });
    fireEvent.change(screen.getByLabelText(/emergency contact phone/i), {
      target: { value: "+919111122222" },
    });
    const kyc = new File(["id"], "id.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/government id document/i), {
      target: { files: [kyc] },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /lock price/i }));

    await waitFor(() => {
      expect(createStayHold).toHaveBeenCalled();
    });
    expect(createStayHold.mock.calls[0][0].guest_count).toBe(1);
  });
});
