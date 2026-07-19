export type Attendance = {
  memberId: string;
  name: string;
  role: string;
  clockInAt: string | null;
  clockOutAt: string | null;
};

export type Day = {
  id: string;
  date: string;
  status: string;
  earnedPaise: number;
  approvedAt: string | null;
  rescheduleToDate: string | null;
  canReschedule: boolean;
  attendance: Attendance[];
};

export type CrewTrackingData = {
  bookingRef: string;
  status: string;
  message: string;
  assignmentMode: string;
  roles: { roleId: string; count: number }[];
  service: { name: string };
  crew: { id: string; name: string; rating: number; leadName: string | null; leadPhone: string | null } | null;
  days: Day[];
  durationDays: number;
  startDate: string;
  address: string;
  quotedAmount: number;
  finalAmountPaise: number;
  paymentStatus: string;
  escrowPaise: number;
  refundedPaise: number;
  needsEscrowPayment: boolean;
  canReportNoShow: boolean;
  canDispute: boolean;
  isDisputed: boolean;
  extensionDays: number;
  extensionChargePaise: number;
  started: boolean;
  startOtp: string | null;
  endOtp: string | null;
  cancellable: boolean;
  cancelPreview: { feePaise: number; finalPaise: number; free: boolean } | null;
  cancelFeePaise: number;
  cancelledAt: string | null;
};
