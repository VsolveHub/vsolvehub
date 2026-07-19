import { Button } from "@/components/ui/Button";

type Props = {
  bookingType: "move_in" | "visit" | null;
  setBookingType: (val: "move_in" | "visit") => void;
  onNext: () => void;
};

export function TypeStep({ bookingType, setBookingType, onNext }: Props) {
  return (
    <>
      <div className="booking-mode-tabs">
        <button
          type="button"
          className={`booking-mode-tab ${bookingType === "move_in" ? "active" : ""}`}
          onClick={() => setBookingType("move_in")}
        >
          Immediate move-in
        </button>
        <button
          type="button"
          className={`booking-mode-tab ${bookingType === "visit" ? "active" : ""}`}
          onClick={() => setBookingType("visit")}
        >
          Schedule visit
        </button>
      </div>
      <Button block onClick={onNext}>
        Next
      </Button>
    </>
  );
}
