import { ProductDetailClient } from "@/components/customer/store/ProductDetailClient";

export const metadata = { title: "Product — V Solve Hub" };

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}
