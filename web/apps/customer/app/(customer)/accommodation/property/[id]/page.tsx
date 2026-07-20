import { notFound } from "next/navigation";
import { getPropertyById } from "@/lib/accommodation/queries";
import { PropertyDetailView } from "@/components/customer/accommodation/PropertyDetailView";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PropertyDetailPage({ params }: PageProps) {
  const { id } = await params;
  const property = await getPropertyById(id);
  if (!property) notFound();

  return (
    <div className="mx-auto w-full max-w-[1280px] p-4">
      <PropertyDetailView property={property} />
    </div>
  );
}
