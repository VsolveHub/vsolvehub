import type { ReactNode } from "react";
import { View } from "react-native";
import { Image } from "expo-image";

import { iconForService } from "@/features/catalog/icon-catalogue/service-icon";
import { useCatalogServiceIndex } from "@/features/catalog/client-queries";
import { isServiceCoverUrl, type CatalogServiceHint } from "@/features/catalog/service-cover";

export function CatalogServiceThumb({
  hint,
  className = "",
}: {
  hint: CatalogServiceHint;
  className?: string;
}) {
  const catalog = useCatalogServiceIndex();
  const service = catalog.find(hint);
  const imageUrl = service?.cover?.url ?? "";
  const iconKey = service?.icon_key ?? "service";

  if (imageUrl !== "") {
    const contain = isServiceCoverUrl(imageUrl);
    return (
      <View
        className={`h-[4.75rem] w-[7rem] shrink-0 overflow-hidden rounded-2xl border border-line bg-[#F4F1EC] ${className}`}
      >
        <Image
          source={{ uri: imageUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit={contain ? "contain" : "cover"}
        />
      </View>
    );
  }

  const IconComponent = iconForService(iconKey);
  return (
    <View
      className={`h-[4.75rem] w-[7rem] shrink-0 items-center justify-center rounded-2xl border border-line bg-[#F4F1EC] ${className}`}
    >
      <IconComponent size={28} color="#0B1B3D" strokeWidth={1.8} />
    </View>
  );
}

export function CatalogServiceThumbRow({
  hint,
  children,
}: {
  hint: CatalogServiceHint;
  children: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3.5">
      <CatalogServiceThumb hint={hint} />
      <View className="min-w-0 flex-1 justify-center">{children}</View>
    </View>
  );
}
