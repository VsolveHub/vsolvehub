// Ported from frontend/apps/partner/features/proposal/model/gallery-sample.ts
import type { EstimateView } from "./estimate-view";

/**
 * The one sample estimate the /design/m2 gallery renders.
 *
 * WHY THIS EXISTS: 22 of the 28 designed M2 screens have no contract behind them
 * — 1.43.0 cannot express an item-wise line. Rather than invent DTOs and let a
 * half-real screen pretend to be wired, the gallery renders the real components
 * with fixed props at `/design/m2/*`, and the wired routes arrive when proposal
 * 0015 is published. Nothing here reaches a customer-facing or partner-facing
 * route.
 *
 * NEVER import this from a real route. It is sample data, not a fallback: if a
 * production screen ever renders these numbers, something has failed open, and
 * a partner would be looking at somebody else's estimate.
 *
 * The figures are the electrician reference (flows/electrician.jpeg) with its
 * arithmetic corrected — that reference's own subtotal is right but its "You
 * will receive" subtracts the contractor profit while claiming to subtract the
 * platform fee. Here: 1,830 lines + 300 charges = 2,130 taxable, +18% GST 383 =
 * 2,513 payable, less 5% commission 107 = 2,406 received. Every screen in the
 * gallery reads these same values, so they cannot disagree with each other.
 */
export const GALLERY_ESTIMATE: EstimateView = {
  invitationId: "sample-invitation",
  mode: "ITEM_WISE",
  documentTitle: "V Estimate – Electrician",
  serviceName: "General Electrical Works",
  partner: { name: "Ramesh Electricals", initials: "RE", rating: "4.8", verified: true },
  customer: { name: "Sunil Kumar", locality: "Kukatpally, Hyderabad", phone: "+91 99887 76655" },
  estimateDate: "20 May 2025",

  sections: [
    {
      id: "wiring",
      title: "Wiring & points",
      subtotal: "₹700",
      lines: [
        {
          id: "switch",
          name: "Switch (6A)",
          qualifier: "Fitting",
          amount: "₹400",
          workings: "5 Nos × ₹80",
          unit: "Nos",
          quantity: "5",
          rate: "₹80",
          buy: {
            note: "buy 5 pcs",
            name: "Modular switch",
            specification: "6 A, white",
            quantity: "5 Nos",
          },
        },
        {
          id: "socket",
          name: "Socket (6A)",
          qualifier: "Fitting",
          amount: "₹300",
          workings: "3 Nos × ₹100",
          unit: "Nos",
          quantity: "3",
          rate: "₹100",
          buy: {
            note: "buy 3 pcs",
            name: "Modular socket",
            specification: "6 A, 3-pin, white",
            quantity: "3 Nos",
          },
        },
      ],
    },
    {
      id: "fixtures",
      title: "Fixtures",
      subtotal: "₹780",
      lines: [
        {
          id: "fan",
          name: "Fan",
          qualifier: "Installation",
          amount: "₹300",
          workings: "2 Nos × ₹150",
          unit: "Nos",
          quantity: "2",
          rate: "₹150",
          buy: {
            note: "buy 2 pcs",
            name: "Ceiling fan",
            specification: "1200 mm sweep",
            quantity: "2 Nos",
          },
        },
        {
          id: "tube",
          name: "Tube Light / LED Light",
          qualifier: "Fitting",
          amount: "₹480",
          workings: "4 Nos × ₹120",
          unit: "Nos",
          quantity: "4",
          rate: "₹120",
          buy: {
            note: "buy 4 pcs",
            name: "LED tube light",
            specification: "20 W, 4 ft, with batten",
            quantity: "4 Nos",
          },
        },
      ],
    },
    {
      id: "panel",
      title: "Panel & safety",
      subtotal: "₹350",
      lines: [
        {
          id: "mcb",
          name: "MCB (Single Pole)",
          qualifier: "Fitting",
          amount: "₹150",
          workings: "1 No × ₹150",
          unit: "No",
          quantity: "1",
          rate: "₹150",
          buy: {
            note: "buy 1 pc",
            name: "MCB, single pole",
            specification: "16 A, C-curve",
            quantity: "1 No",
          },
        },
        {
          id: "db",
          name: "DB Box",
          qualifier: "Fitting",
          amount: "₹200",
          workings: "1 No × ₹200",
          unit: "No",
          quantity: "1",
          rate: "₹200",
          buy: {
            note: "buy 1 pc",
            name: "Distribution box",
            specification: "8-way, single door",
            quantity: "1 No",
          },
        },
      ],
    },
  ],

  charges: [
    { id: "transport", code: "TRANSPORT", label: "Transportation", amount: "₹200" },
    { id: "loading", code: "LOADING_UNLOADING", label: "Loading & unloading", amount: "₹100" },
  ],

  totals: {
    linesTotal: "₹1,830",
    chargesTotal: "₹300",
    taxableValue: "₹2,130",
    taxLabel: "GST 18%",
    taxAmount: "₹383",
    customerTotal: "₹2,513",
    customerTotalInWords: "Two Thousand Five Hundred Thirteen Only",
    commissionLabel: "V Solve Hub commission (5%)",
    commissionAmount: "−₹107",
    partnerReceives: "₹2,406",
    allocationRemaining: "₹0",
    allocationReconciles: true,
  },

  installments: [
    {
      id: "i1",
      position: 1,
      title: "Wiring, boards & MCB",
      deliverable: "Boards fitted, circuits live",
      amount: "₹1,200",
      sharePercent: 56,
      expectedCompletion: "24 May",
    },
    {
      id: "i2",
      position: 2,
      title: "Fittings, testing & handover",
      deliverable: "Every point tested and handed over",
      amount: "₹930",
      sharePercent: 44,
      expectedCompletion: "26 May",
    },
  ],

  materials: [
    { id: "m1", name: "Modular switch", specification: "6 A, white", quantity: "5 Nos", shop: "Electrical shop" },
    { id: "m2", name: "Modular socket", specification: "6 A, 3-pin, white", quantity: "3 Nos", shop: "Electrical shop" },
    { id: "m3", name: "Ceiling fan", specification: "1200 mm sweep", quantity: "2 Nos", shop: "Electrical shop" },
    { id: "m4", name: "LED tube light", specification: "20 W, 4 ft, with batten", quantity: "4 Nos", shop: "Electrical shop" },
    { id: "m5", name: "MCB, single pole", specification: "16 A, C-curve", quantity: "1 No", shop: "Electrical shop" },
    { id: "m6", name: "Distribution box", specification: "8-way, single door", quantity: "1 No", shop: "Electrical shop" },
    { id: "m7", name: "Modular plate & back box", specification: "2-module, matching switches", quantity: "8 Nos", shop: "Hardware" },
    { id: "m8", name: "PVC casing", specification: "1 inch", quantity: "10 ft", shop: "Hardware" },
    { id: "m9", name: "Screws, clips & insulation tape", specification: "Assorted", quantity: "1 set", shop: "Hardware" },
  ],

  blockedReason: "Add payment installments before you send.",
};
