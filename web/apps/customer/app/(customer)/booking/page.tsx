import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { BookingFlow } from "@/components/customer/booking/BookingFlow";

type PageProps = {
  searchParams: Promise<{ serviceId?: string }>;
};

export default async function BookingPage({ searchParams }: PageProps) {
  const { serviceId } = await searchParams;
  if (!serviceId) redirect("/services");

  const session = await getServerSession();
  if (!session) {
    redirect(`/booking/otp?redirect=${encodeURIComponent(`/booking?serviceId=${serviceId}`)}`);
  }

  return <BookingFlow serviceId={serviceId} />;
}
