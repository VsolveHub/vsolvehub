import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { formatPhone } from "@/lib/format";
import { ProfileAccountView } from "@/components/customer/profile/ProfileAccountView";

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile");

  const quickActions = [
    { label: "My bookings", href: "/profile/bookings" },
    { label: "Notifications", href: "/notifications" },
    { label: "Saved services", href: "/profile/saved" },
    { label: "Help & support", href: "/profile/help" },
  ];

  const menuItems = [
    { label: "My Plans", href: "/profile/plans" },
    { label: "Wallet", href: "/profile/wallet" },
    { label: "Plus membership", href: "/profile/membership" },
    { label: "My rating", href: "/profile/rating" },
    { label: "Manage addresses", href: "/profile/addresses" },
    { label: "Manage payment methods", href: "/profile/payments" },
    { label: "Settings", href: "/profile/settings" },
    { label: "About V Solve Hub", href: "/profile/about" },
  ];

  return (
    <ProfileAccountView
      name={session.name ?? "VSolveHub customer"}
      phone={formatPhone(session.phone)}
      email={null}
      quickActions={quickActions}
      menuItems={menuItems}
    />
  );
}
