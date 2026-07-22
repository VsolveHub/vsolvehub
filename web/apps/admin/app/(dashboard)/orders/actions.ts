"use server";

import { revalidatePath } from "next/cache";
import { prisma, type ProductOrderStatus } from "@vsolve/db";
import { requireAdmin } from "@/lib/auth";

/** Forward-only fulfilment flow; CANCELLED is reachable until handover. */
const NEXT_STATUS: Partial<Record<ProductOrderStatus, ProductOrderStatus[]>> = {
  PLACED: ["PACKED", "CANCELLED"],
  PACKED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

export async function setOrderStatus(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ProductOrderStatus;
  if (!id || !status) return;

  const order = await prisma.productOrder.findUnique({ where: { id } });
  if (!order) return;
  if (!NEXT_STATUS[order.status]?.includes(status)) return;

  await prisma.$transaction(async (tx) => {
    await tx.productOrder.update({ where: { id }, data: { status } });
    if (status === "CANCELLED") {
      // Return the claimed stock so cancelled inventory is sellable again.
      const items = await tx.productOrderItem.findMany({ where: { productOrderId: id } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.qty } },
        });
      }
    }
    await tx.adminAction.create({
      data: { adminId: admin.id, partnerId: id, action: `PRODUCT_ORDER_${status}`, reason: order.orderRef },
    });
  });

  revalidatePath("/orders");
}
