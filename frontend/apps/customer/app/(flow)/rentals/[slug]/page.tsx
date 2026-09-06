import { redirect } from "next/navigation";

export default async function RentalServiceRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/catalog/rental-services/${slug}`);
}
