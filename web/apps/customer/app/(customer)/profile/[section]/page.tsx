import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import {
  AboutSection,
  HelpSection,
  MembershipSection,
  PaymentsSection,
  PlansSection,
  RatingSection,
  SettingsSection,
  WalletSection,
} from "@/components/customer/profile/sections/ProfileSectionContent";
import { getUserBookingCount } from "@/lib/bookings/user-bookings";

const SECTION_TITLES: Record<string, string> = {
  help: "Help & support",
  plans: "My Plans",
  wallet: "Wallet",
  membership: "Plus membership",
  rating: "My rating",
  payments: "Manage payment methods",
  settings: "Settings",
  about: "About V Solve Hub",
};

type Props = {
  params: Promise<{ section: string }>;
};

export default async function ProfileSectionPage({ params }: Props) {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile");

  const { section } = await params;
  const title = SECTION_TITLES[section];
  if (!title) redirect("/profile");

  const bookingCount =
    section === "rating" ? await getUserBookingCount(session.id) : 0;

  const content = (() => {
    switch (section) {
      case "help":
        return <HelpSection />;
      case "plans":
        return <PlansSection />;
      case "wallet":
        return <WalletSection />;
      case "membership":
        return <MembershipSection />;
      case "rating":
        return <RatingSection bookingCount={bookingCount} />;
      case "payments":
        return <PaymentsSection />;
      case "settings":
        return <SettingsSection />;
      case "about":
        return <AboutSection />;
      default:
        return null;
    }
  })();

  return <ProfileSubPage title={title}>{content}</ProfileSubPage>;
}
