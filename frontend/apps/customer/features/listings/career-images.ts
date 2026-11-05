/**
 * Helper to resolve relevant, high-quality images and tile fallbacks for career & job listings.
 */

export function getCareerImage(listing?: {
  title?: string;
  job_category?: string;
  poster_name?: string;
  media?: { url?: string }[];
  structured_fields?: unknown;
}): { url: string; fallback: string } {
  const mediaUrl =
    Array.isArray(listing?.media) && listing?.media[0]?.url
      ? listing.media[0].url
      : undefined;

  const text = `${listing?.title || ""} ${listing?.job_category || ""} ${listing?.poster_name || ""}`.toLowerCase();

  let heroPhoto = "";
  let fallback = "/catalog/tiles/career-jobs.png";

  if (
    text.includes("developer") ||
    text.includes("software") ||
    text.includes("qa") ||
    text.includes("stack") ||
    text.includes("it ") ||
    text.includes("programmer") ||
    text.includes("engineer") ||
    text.includes("frontend") ||
    text.includes("backend") ||
    text.includes("tech")
  ) {
    heroPhoto = "/catalog/careers/developer-working-on-laptop.jpg";
    fallback = "/catalog/tiles/it-software-jobs.png";
  } else if (
    text.includes("accountant") ||
    text.includes("tally") ||
    text.includes("finance") ||
    text.includes("accounts") ||
    text.includes("tax")
  ) {
    // Exact accountant workspace with calculator, charts, and documents
    heroPhoto = "/catalog/careers/accountant-working-with-financial-calculator.jpg";
    fallback = "/catalog/careers/accountant-working-with-financial-calculator.jpg";
  } else if (text.includes("cashier")) {
    heroPhoto = "/catalog/careers/cashier-handling-retail-transaction.jpg";
    fallback = "/catalog/tiles/retail-shop-staff.png";
  } else if (text.includes("billing")) {
    heroPhoto = "/catalog/careers/man-working-at-billing-counter.jpg";
    fallback = "/catalog/tiles/retail-shop-staff.png";
  } else if (
    text.includes("jewellery") ||
    text.includes("jewelry")
  ) {
    heroPhoto = "/catalog/careers/sales-executive-presenting-jewellery.jpg";
    fallback = "/catalog/tiles/retail-shop-staff.png";
  } else if (
    text.includes("sales") ||
    text.includes("showroom") ||
    text.includes("retail") ||
    text.includes("store") ||
    text.includes("shop") ||
    text.includes("counter")
  ) {
    heroPhoto = "/catalog/careers/sales-executive-assisting-customer.jpg";
    fallback = "/catalog/tiles/retail-shop-staff.png";
  } else if (
    text.includes("nurse") ||
    text.includes("doctor") ||
    text.includes("pharma") ||
    text.includes("health") ||
    text.includes("hospital") ||
    text.includes("medical") ||
    text.includes("clinic")
  ) {
    heroPhoto = "/catalog/careers/nurse-wearing-stethoscope-in-hospital.jpg";
    fallback = "/catalog/tiles/health-care-jobs.png";
  } else if (
    text.includes("construction") ||
    text.includes("supervisor") ||
    text.includes("civil") ||
    text.includes("site") ||
    text.includes("contractor")
  ) {
    heroPhoto = "/catalog/careers/supervisor-reviewing-construction-site.jpg";
    fallback = "/catalog/tiles/construction-jobs.png";
  } else if (
    text.includes("waiter") ||
    text.includes("steward") ||
    text.includes("chef") ||
    text.includes("cook") ||
    text.includes("hotel") ||
    text.includes("restaurant") ||
    text.includes("barista") ||
    text.includes("hospitality")
  ) {
    heroPhoto = "/catalog/careers/waiter-holding-serving-tray.jpg";
    fallback = "/catalog/tiles/hotels-restaurant-jobs.png";
  } else if (
    text.includes("warehouse") ||
    text.includes("packer") ||
    text.includes("helper") ||
    text.includes("logistics") ||
    text.includes("delivery") ||
    text.includes("dispatch")
  ) {
    heroPhoto = "/catalog/careers/worker-packing-boxes-in-warehouse.jpg";
    fallback = "/catalog/tiles/delivery-logistics-jobs.png";
  } else if (
    text.includes("bpo") ||
    text.includes("call center") ||
    text.includes("telecaller") ||
    text.includes("customer support") ||
    text.includes("voice")
  ) {
    heroPhoto = "/catalog/tiles/customer-support-jobs.png";
    fallback = "/catalog/tiles/customer-support-jobs.png";
  } else if (
    text.includes("office") ||
    text.includes("coordinator") ||
    text.includes("admin") ||
    text.includes("hr") ||
    text.includes("recruiter") ||
    text.includes("assistant")
  ) {
    heroPhoto = "/catalog/careers/woman-working-at-office-desk.jpg";
    fallback = "/catalog/tiles/office-admin-jobs.png";
  } else if (text.includes("driver") || text.includes("chauffeur") || text.includes("cab")) {
    heroPhoto = "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?q=80&w=800&auto=format&fit=crop";
    fallback = "/catalog/tiles/driver-jobs.png";
  } else if (text.includes("security") || text.includes("guard")) {
    heroPhoto = "https://images.unsplash.com/photo-1557597774-9d273605dfa9?q=80&w=800&auto=format&fit=crop";
    fallback = "/catalog/tiles/security-jobs.png";
  } else if (
    text.includes("technician") ||
    text.includes("electrician") ||
    text.includes("plumber") ||
    text.includes("carpenter") ||
    text.includes("mechanic")
  ) {
    heroPhoto = "https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=800&auto=format&fit=crop";
    fallback = "/catalog/tiles/technician-jobs.png";
  } else {
    heroPhoto = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop";
  }

  return {
    url: mediaUrl || heroPhoto || fallback,
    fallback,
  };
}
