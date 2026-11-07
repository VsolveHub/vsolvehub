import { useLocalSearchParams } from "expo-router";

import { CategoryScreen } from "@/features/catalog/view/category-screen";

export default function Screen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  return <CategoryScreen categorySlug={category} />;
}
