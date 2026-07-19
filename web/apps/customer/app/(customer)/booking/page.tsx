import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getServicesByIds } from "@/lib/catalog/queries";
import { ServiceBookingFlow, type FlowService } from "@/components/customer/booking/ServiceBookingFlow";

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

  // Resolve the single service on the SERVER (DB, cached) and hand it to the
  // client flow as a prop — instead of shipping the whole catalog to the browser
  // for a client-side `.find()`.
  const [service] = await getServicesByIds([serviceId]);
  if (!service) notFound();

  return (
    <ServiceBookingFlow
      services={[service as FlowService]}
      categorySlug={service.category.slug}
      categoryName={service.category.name}
      initialServiceId={service.id}
    />
  );
}
