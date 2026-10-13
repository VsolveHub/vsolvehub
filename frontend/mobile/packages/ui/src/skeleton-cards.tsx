import { View } from "react-native";
import { Skeleton } from "./skeleton";

export function ListingCardSkeleton() {
  return (
    <View className="rounded-2xl border border-line bg-surface p-4 shadow-xs mb-3">
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-5 w-48 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </View>
      <Skeleton className="mt-2 h-3.5 w-32 rounded-md" />
      <View className="mt-3.5 flex-row gap-2">
        <Skeleton className="h-6 w-20 rounded-lg" />
        <Skeleton className="h-6 w-24 rounded-lg" />
        <Skeleton className="h-6 w-20 rounded-lg" />
      </View>
      <View className="mt-4 pt-3 border-t border-line/60 flex-row items-center justify-between">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </View>
    </View>
  );
}

export function ApplicationCardSkeleton() {
  return (
    <View className="rounded-2xl border border-line bg-surface p-4 shadow-xs mb-3">
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </View>
      <Skeleton className="mt-2 h-3.5 w-28 rounded-md" />
      <Skeleton className="mt-3 h-3 w-36 rounded-md" />
      <View className="mt-4 pt-3 border-t border-line/60 flex-row justify-end">
        <Skeleton className="h-8 w-24 rounded-xl" />
      </View>
    </View>
  );
}

export function ApplicantCardSkeleton() {
  return (
    <View className="rounded-2xl border border-line bg-surface p-4 shadow-xs mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Skeleton circle className="h-10 w-10" />
          <View className="gap-1.5">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </View>
        </View>
        <Skeleton className="h-6 w-20 rounded-full" />
      </View>
      <View className="mt-3 flex-row gap-2">
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </View>
      <View className="mt-4 pt-3 border-t border-line/60 flex-row justify-between">
        <Skeleton className="h-8 w-28 rounded-xl" />
        <Skeleton className="h-8 w-28 rounded-xl" />
      </View>
    </View>
  );
}
