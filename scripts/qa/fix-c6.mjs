import fs from "fs";

const filePath = "frontend/mobile/apps/customer/src/features/stays/view/stay-detail-screen.tsx";
let code = fs.readFileSync(filePath, "utf8");
code = code.replace(/\r\n/g, "\n");

// 1. Refusal message & types
const oldRefusal = `function refusalMessage(err: unknown, minimumLabel: string): string {
  if (err && typeof err === "object") {
    if ("fieldErrors" in err && (err as any).fieldErrors) {
      const fieldErrors = (err as any).fieldErrors as Record<string, string[]>;
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField && fieldErrors[firstField]?.length) {
        return fieldErrors[firstField][0];
      }
    }
    const code = (err as any).code;
    if (code === "duplicate_enquiry") {
      return "You already have an active enquiry for this stay.";
    }
    if (code === "min_stay_not_met") {
      return \`Minimum stay is \${minimumLabel}.\`;
    }
    if (code === "max_stay_exceeded") {
      return "Selected stay length exceeds the maximum allowed duration.";
    }
    if (code === "dates_unavailable") {
      return "The host isn't taking stays for those dates.";
    }
    if (code === "check_in_in_past") {
      return "The check-in date cannot be in the past.";
    }
    if (code === "length_required") {
      return "Please select how long you want to stay.";
    }
    if (code === "room_unavailable") {
      return "This room is no longer available. Please select another room.";
    }
    if (code === "too_many_guests") {
      return "This room cannot accommodate that many guests.";
    }
    if (code === "room_required") {
      return "Please select a room.";
    }
  }
  return (err as any)?.message || "Failed to send enquiry.";
}`;

const newRefusal = `interface ApiErrorShape {
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

function refusalMessage(err: unknown, minimumLabel: string): string {
  if (err && typeof err === "object") {
    const apiErr = err as ApiErrorShape;
    if (apiErr.fieldErrors) {
      const firstField = Object.keys(apiErr.fieldErrors)[0];
      if (firstField && apiErr.fieldErrors[firstField]?.length) {
        return apiErr.fieldErrors[firstField][0];
      }
    }
    const code = apiErr.code;
    if (code === "duplicate_enquiry") {
      return "You already have an active enquiry for this stay.";
    }
    if (code === "min_stay_not_met") {
      return \`Minimum stay is \${minimumLabel}.\`;
    }
    if (code === "max_stay_exceeded") {
      return "Selected stay length exceeds the maximum allowed duration.";
    }
    if (code === "dates_unavailable") {
      return "The host isn't taking stays for those dates.";
    }
    if (code === "check_in_in_past") {
      return "The check-in date cannot be in the past.";
    }
    if (code === "length_required") {
      return "Please select how long you want to stay.";
    }
    if (code === "room_unavailable") {
      return "This room is no longer available. Please select another room.";
    }
    if (code === "too_many_guests") {
      return "This room cannot accommodate that many guests.";
    }
    if (code === "room_required") {
      return "Please select a room.";
    }
    if (typeof apiErr.message === "string") {
      return apiErr.message;
    }
  }
  return "Failed to send enquiry.";
}`;

if (!code.includes(oldRefusal)) {
  console.error("Could not find oldRefusal");
  process.exit(1);
}
code = code.replace(oldRefusal, newRefusal);

// 2. Unit media urls
const oldMedia = `  const unitMediaUrls =
    (currentUnit as any)?.media?.map((m: any) => m.url).filter(Boolean) ?? [];`;
const newMedia = `  const unitMediaUrls =
    currentUnit?.media?.map((m) => m.url).filter(Boolean) ?? [];`;

if (!code.includes(oldMedia)) {
  console.error("Could not find oldMedia");
  process.exit(1);
}
code = code.replace(oldMedia, newMedia);

// 3. Enquiry mutation payload & onError
const oldEnquiry = `  const enquiryMutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: property.id,
        unit_id: currentUnitId || null,
        check_in: checkIn,
        length,
        guest_count: totalGuests,
        adult_count: adults,
        child_count: children,
        message,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      setIsDuplicateEnquiry(false);
      setIsSuccess(true);
    },
    onError: (err: unknown) => {
      const isDup =
        (isApiRequestError(err) && err.code === "duplicate_enquiry") ||
        (err as any)?.code === "duplicate_enquiry" ||
        (typeof (err as any)?.message === "string" &&
          (err as any).message.toLowerCase().includes("active enquiry already exists"));`;

const newEnquiry = `  const enquiryMutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: property.id,
        unit_id: currentUnitId || null,
        check_in: checkIn,
        length,
        guest_count: totalGuests,
        adult_count: adults,
        child_count: children,
        message,
        look_id: selectedLookId || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      setIsDuplicateEnquiry(false);
      setIsSuccess(true);
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiErrorShape;
      const isDup =
        (isApiRequestError(err) && err.code === "duplicate_enquiry") ||
        apiErr?.code === "duplicate_enquiry" ||
        (typeof apiErr?.message === "string" &&
          apiErr.message.toLowerCase().includes("active enquiry already exists"));`;

if (!code.includes(oldEnquiry)) {
  console.error("Could not find oldEnquiry");
  process.exit(1);
}
code = code.replace(oldEnquiry, newEnquiry);

// 4. Mount StayVisitSheet
const oldReviewSheet = `      {/* Write a Review Sheet */}
      <StayReviewSheet
        propertyId={property.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => void refetch()}
      />`;

const newReviewSheet = `      {/* Write a Review Sheet */}
      <StayReviewSheet
        propertyId={property.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => void refetch()}
      />

      {/* Schedule Visit Sheet */}
      <StayVisitSheet
        property={property}
        initialUnitId={selectedUnitId}
        initialLookId={selectedLookId}
        open={visitSheetOpen}
        onOpenChange={setVisitSheetOpen}
      />`;

if (!code.includes(oldReviewSheet)) {
  console.error("Could not find oldReviewSheet");
  process.exit(1);
}
code = code.replace(oldReviewSheet, newReviewSheet);

fs.writeFileSync(filePath, code);
console.log("Updated stay-detail-screen.tsx successfully!");

