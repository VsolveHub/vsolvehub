import { BOOKING_FEE_PAISE, TOKEN_ADVANCE_PAISE } from "./constants";

export function computeAccommodationPayment(propertyPricePaise: number, includeFirstMonth: boolean) {
  const tokenAdvancePaise = TOKEN_ADVANCE_PAISE;
  const bookingFeePaise = BOOKING_FEE_PAISE;
  const firstMonthRentPaise = includeFirstMonth ? propertyPricePaise : 0;
  const totalPaidPaise = tokenAdvancePaise + bookingFeePaise + firstMonthRentPaise;
  return { tokenAdvancePaise, bookingFeePaise, firstMonthRentPaise, totalPaidPaise };
}
