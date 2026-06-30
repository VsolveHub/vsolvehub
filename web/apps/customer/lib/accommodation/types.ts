import type { AccommodationTypeSlug } from "./constants";

export type AccommodationFilters = {
  type?: AccommodationTypeSlug | "";
  budgetMin?: number;
  budgetMax?: number;
  ac?: "ac" | "non-ac" | "";
  furnished?: "furnished" | "unfurnished" | "";
  sharing?: "single" | "double" | "";
  foodIncluded?: boolean;
  gender?: "any" | "male" | "female" | "";
};

export type PropertyListItem = {
  id: string;
  propertyType: string;
  title: string;
  location: string;
  area: string;
  pricePaise: number;
  priceUnit: string;
  distanceKm: number;
  rating: number;
  roomType: string;
  isAvailable: boolean;
  imageUrl: string;
  hasAc: boolean;
  isFurnished: boolean;
  sharingType: string;
  foodIncluded: boolean;
  genderPreference: string;
};

export type PropertyDetail = PropertyListItem & {
  city: string;
  depositPaise: number;
  images: string[];
  amenities: string[];
  rules: string[];
  owner: {
    id: string;
    name: string;
    phone: string;
    rating: number;
  };
};

export type AccommodationBookingDraft = {
  propertyId: string;
  bookingType: "move_in" | "visit" | null;
  moveInDate: string;
  visitDate: string;
  durationMonths: number;
  numberOfPeople: number;
  occupation: string;
  specialRequirements: string;
  idProofUrls: string[];
  includeFirstMonthRent: boolean;
  paymentMethod: "upi" | "card" | "wallet" | "cod" | null;
};
