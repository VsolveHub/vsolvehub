import fs from "fs";

// 1. Update rental-booking-card.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/rentals/view/rental-booking-card.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Add import
  const importTarget = 'import { cancelRentalBooking } from "../queries";';
  const importReplacement = `import { cancelRentalBooking } from "../queries";
import { DeliveryRequest } from "./delivery-request";`;
  content = content.replace(importTarget, importReplacement);

  // Mount DeliveryRequest after details card
  const mountTarget = `      </View>

      {/* Handover PIN Display Banner (Web W-021, Dev-10) */}`;
  const mountReplacement = `      </View>

      {isDelivery ? <DeliveryRequest booking={booking} /> : null}

      {/* Handover PIN Display Banner (Web W-021, Dev-10) */}`;
  content = content.replace(mountTarget, mountReplacement);

  fs.writeFileSync(filePath, content);
  console.log("Updated rental-booking-card.tsx");
}

// 2. Update rental-book-sheet.tsx
{
  const filePath = "frontend/mobile/apps/customer/src/features/rentals/view/rental-book-sheet.tsx";
  let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

  // Add AddressSheet import
  const importTarget = 'import { completeOrOpenRentalCheckout } from "../payment-handoff";';
  const importReplacement = `import { completeOrOpenRentalCheckout } from "../payment-handoff";
import { AddressSheet } from "@/features/checkout/view/address-sheet";`;
  content = content.replace(importTarget, importReplacement);

  // Add addressSheetOpen state
  const stateTarget = `  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);`;
  const stateReplacement = `  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);`;
  content = content.replace(stateTarget, stateReplacement);

  // Fix mutation onSuccess for delivery mode
  const successTarget = `    onSuccess: async (booking) => {
      setIsProcessing(true);
      try {
        await queryClient.invalidateQueries({ queryKey: ["rental-asset"] });
        await queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
        const deposit = booking.deposit;
        const attemptId = deposit?.payment_attempt_id;

        if (attemptId) {`;

  const successReplacement = `    onSuccess: async (booking) => {
      setIsProcessing(true);
      try {
        await queryClient.invalidateQueries({ queryKey: ["rental-asset"] });
        await queryClient.invalidateQueries({ queryKey: ["my-rentals"] });

        if (isDelivery || booking.status === "AWAITING_TRANSPORT_QUOTE") {
          setIsProcessing(false);
          onOpenChange(false);
          Alert.alert(
            "Delivery Request Sent",
            "The owner will review your delivery requirement and quote a transport price. Check My Rentals for updates.",
            [
              {
                text: "View My Rentals",
                onPress: () => router.push("/activity?type=rentals" as never),
              },
            ],
          );
          return;
        }

        const deposit = booking.deposit;
        const attemptId = deposit?.payment_attempt_id;

        if (attemptId) {`;

  content = content.replace(successTarget, successReplacement);

  // Fix 0 addresses dead-end in JSX
  const addressDeadEndTarget = `                {addresses.length === 0 ? (
                  <View className="rounded-xl border border-line bg-canvas p-3">
                    <Text className="text-xs text-text-secondary">
                      No saved addresses found. Please save an address in your profile before choosing delivery.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-2">`;

  const addressDeadEndReplacement = `                {addresses.length === 0 ? (
                  <View className="rounded-xl border border-line bg-canvas p-3.5 gap-2.5">
                    <Text className="text-xs text-text-secondary">
                      No saved addresses found. Add a delivery address to continue.
                    </Text>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => setAddressSheetOpen(true)}
                      className="self-start"
                    >
                      <Text className="text-xs font-bold text-navy-900">+ Add Address</Text>
                    </Button>
                  </View>
                ) : (
                  <View className="gap-2">`;

  content = content.replace(addressDeadEndTarget, addressDeadEndReplacement);

  // Add "+ Add another address" and mount AddressSheet
  const endDialogTarget = `      </Dialog>
    </>
  );
}`;

  const endDialogReplacement = `      </Dialog>

      <AddressSheet
        open={addressSheetOpen}
        onOpenChange={setAddressSheetOpen}
        addresses={addresses}
        selectedAddressId={effectiveAddressId}
        onSelect={(id) => {
          setSelectedAddressId(id);
          setError(null);
        }}
      />
    </>
  );
}`;

  content = content.replace(endDialogTarget, endDialogReplacement);

  fs.writeFileSync(filePath, content);
  console.log("Updated rental-book-sheet.tsx");
}

