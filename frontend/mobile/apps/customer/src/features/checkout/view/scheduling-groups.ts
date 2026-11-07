import type { CartItem, SchedulingGroup } from "../queries";

/**
 * Derives scheduling groups from API response or falls back to cart items.
 * Matches Image 2: "Switch & socket" (45 mins), "Home Cleaning" (5 hrs).
 */
export function deriveSchedulingGroups(
  cartItems: readonly CartItem[],
  apiGroups?: readonly SchedulingGroup[] | null,
): readonly SchedulingGroup[] {
  if (apiGroups && apiGroups.length > 0) return apiGroups;
  if (!cartItems || cartItems.length === 0) return [];

  const groupsMap = new Map<
    string,
    { label: string; duration: number; itemIds: string[] }
  >();

  for (const item of cartItems) {
    const text = `${item.service_name} ${item.service_slug} ${item.variant_name || ""}`.toLowerCase();
    let key = "other";
    let label = item.service_name;
    let duration = 60;

    if (text.includes("switch") || text.includes("socket") || text.includes("electric")) {
      key = "switch-socket";
      label = "Switch & socket";
      duration = 45;
    } else if (text.includes("clean")) {
      key = "home-cleaning";
      label = "Home Cleaning";
      duration = 300;
    } else if (text.includes("carpent") || text.includes("wood") || text.includes("furniture")) {
      key = "carpenter";
      label = "Carpenter";
      duration = 60;
    } else if (text.includes("plumb") || text.includes("pipe") || text.includes("tap")) {
      key = "plumbing";
      label = "Plumbing";
      duration = 60;
    } else if (text.includes("appliance") || text.includes("ac") || text.includes("repair")) {
      key = "appliance-repair";
      label = "Appliance Repair";
      duration = 90;
    } else {
      key = item.service_slug || item.id;
      label = item.service_name;
      duration = 60;
    }

    const existing = groupsMap.get(key);
    if (existing) {
      existing.itemIds.push(item.id);
    } else {
      groupsMap.set(key, { label, duration, itemIds: [item.id] });
    }
  }

  return Array.from(groupsMap.entries()).map(([key, info]) => ({
    key,
    label: info.label,
    estimated_duration_minutes: info.duration,
    cart_item_ids: info.itemIds,
  }));
}

