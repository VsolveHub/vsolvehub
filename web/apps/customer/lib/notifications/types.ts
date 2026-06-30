export type NotificationTone = "alert" | "success" | "info" | "warning";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  href: string;
  icon: string;
  tone: NotificationTone;
  bookingRef?: string;
  status?: string;
};
