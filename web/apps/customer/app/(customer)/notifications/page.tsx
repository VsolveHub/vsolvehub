import { NotificationsScreen } from "@/components/notifications/NotificationsScreen";

export const metadata = {
  title: "Notifications — V Solve Hub",
};

export default function NotificationsPage() {
  return (
    <NotificationsScreen audience="customer" backHref="/" backLabel="Home" />
  );
}
