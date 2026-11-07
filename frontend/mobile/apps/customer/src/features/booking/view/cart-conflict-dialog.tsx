// Ported from frontend/apps/customer/features/booking/view/cart-conflict-dialog.tsx
import { Button, Dialog, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";

export function DuplicateItemDialog({
  isOpen,
  serviceName,
  onViewBooking,
  onDismiss,
}: {
  isOpen: boolean;
  serviceName: string;
  onViewBooking: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title="This is already in your booking"
      footer={
        <View className="flex-row flex-wrap gap-3">
          <Button onPress={onViewBooking}>Go to my booking</Button>
          <Button variant="outline" onPress={onDismiss}>
            Change my answers
          </Button>
        </View>
      }
    >
      <Text className="text-sm leading-6 text-text">{serviceName} is already there with exactly these answers. Nothing has changed.</Text>
      <Text className="mt-2 text-sm text-text-secondary">If you need it done more than once, change the quantity on the one you already have.</Text>
    </Dialog>
  );
}
