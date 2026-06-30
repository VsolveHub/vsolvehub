import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getAllUserBookings } from "@/lib/bookings/user-bookings";
import { MessagesInbox } from "@/components/customer/messages/MessagesInbox";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";

export default async function ProfileMessagesPage() {
  const session = await getServerSession();
  if (!session) redirect("/booking/otp?redirect=/profile/messages");

  const bookings = await getAllUserBookings(session.id);

  return (
    <ProfileSubPage title="Messages">
      <MessagesInbox bookings={bookings} />
    </ProfileSubPage>
  );
}
