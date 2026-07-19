export type TrackingData = {
  bookingRef: string;
  flowType: string;
  status: string;
  message: string;
  quotedAmount: number;
  depositPaise: number;
  details: Record<string, any>;
  driver: { name: string; phone: string; rating: number; vehicleNumber: string } | null;
  rentalAsset: { name: string; brand: string; model: string } | null;
  vendor: { name: string; phone: string; rating: number } | null;
  statusLogs: { status: string }[];
};
