import type { BookingParty } from "@/lib/booking/types";
import { DesktopProfessionalCard } from "./DesktopProfessionalCard";
import { MobileTopProfessionalCard } from "./MobileTopProfessionalCard";

type Props = {
  professional: BookingParty | null;
  variant: "desktop" | "mobileTop";
  status?: string;
};

export function ProfessionalCard({ professional, variant, status }: Props) {
  if (variant === "desktop") {
    return <DesktopProfessionalCard professional={professional} />;
  }
  return <MobileTopProfessionalCard professional={professional} status={status} />;
}
