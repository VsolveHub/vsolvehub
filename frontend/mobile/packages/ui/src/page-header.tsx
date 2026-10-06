// Ported from frontend/packages/ui/src/page-header.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "./text";

export interface PageHeaderProps {
  breadcrumbs?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ breadcrumbs, title, description, actions }: PageHeaderProps) {
  return (
    <View className="mb-6 gap-4">
      <View className="gap-1.5">
        {breadcrumbs ? <View className="mb-1">{breadcrumbs}</View> : null}
        <Text className="text-2xl font-bold text-text">{title}</Text>
        {description ? <Text className="text-sm text-text-secondary">{description}</Text> : null}
      </View>
      {actions ? <View className="flex-row items-center gap-3">{actions}</View> : null}
    </View>
  );
}
