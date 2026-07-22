// ─────────────────────────────────────────────────────────────────────────────
// Marketplace cart: a ProductOrder row in CART status (at most one per user).
// Lines snapshot unit price + GST at add time; checkout re-snapshots from the
// live catalog so a price change between add and pay is honoured transparently,
// then claims stock and funds the whole thing through the same Order envelope
// as service checkouts.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/client";
import { decrementStock, priceProductLine, toPublicProduct, type PublicProduct } from "@vsolve/db";
import { authorizeOrder } from "@/lib/orders/authorize";
import { generateOrderRef } from "@/lib/format";
import type { PaymentMethod } from "@vsolve/db";

export type StoreCartPayload = {
  id: string | null;
  items: {
    id: string;
    productId: string;
    qty: number;
    unitPricePaise: number;
    gstPaise: number;
    totalPaise: number;
    product: PublicProduct;
  }[];
  totalPaise: number;
};

const CART_INCLUDE = {
  items: {
    include: { product: { include: { brand: true, productCategory: true } } },
    orderBy: { id: "asc" as const },
  },
};

type CartRow = NonNullable<Awaited<ReturnType<typeof findCart>>>;

function findCart(userId: string) {
  return prisma.productOrder.findFirst({
    where: { userId, status: "CART" },
    include: CART_INCLUDE,
  });
}

export function serializeCart(cart: CartRow | null): StoreCartPayload {
  if (!cart) return { id: null, items: [], totalPaise: 0 };
  const items = cart.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    qty: i.qty,
    unitPricePaise: i.unitPricePaise,
    gstPaise: i.gstPaise,
    totalPaise: i.totalPaise,
    product: toPublicProduct(i.product),
  }));
  return { id: cart.id, items, totalPaise: items.reduce((s, i) => s + i.totalPaise, 0) };
}

export async function getStoreCart(userId: string): Promise<StoreCartPayload> {
  return serializeCart(await findCart(userId));
}

export async function addToStoreCart(
  userId: string,
  productId: string,
  qty: number,
): Promise<StoreCartPayload | { error: string; status: number }> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) return { error: "Product not found", status: 404 };

  let cart = await findCart(userId);
  if (!cart) {
    await prisma.productOrder.create({
      data: { orderRef: generateOrderRef(), userId, status: "CART" },
    });
    cart = await findCart(userId);
  }

  const existing = cart!.items.find((i) => i.productId === productId);
  const newQty = Math.min((existing?.qty ?? 0) + qty, 99);
  if (product.stockQty < newQty) return { error: `"${product.name}" is out of stock`, status: 409 };

  const price = priceProductLine(product, newQty);
  if (existing) {
    await prisma.productOrderItem.update({
      where: { id: existing.id },
      data: { qty: newQty, ...price },
    });
  } else {
    await prisma.productOrderItem.create({
      data: { productOrderId: cart!.id, productId, qty: newQty, ...price },
    });
  }
  return serializeCart(await findCart(userId));
}

export async function updateStoreCartLine(
  userId: string,
  lineId: string,
  qty: number,
): Promise<StoreCartPayload | { error: string; status: number }> {
  const line = await prisma.productOrderItem.findUnique({
    where: { id: lineId },
    include: { productOrder: true, product: true },
  });
  if (!line || line.productOrder.userId !== userId || line.productOrder.status !== "CART") {
    return { error: "Cart item not found", status: 404 };
  }
  if (qty <= 0) {
    await prisma.productOrderItem.delete({ where: { id: lineId } });
  } else {
    if (line.product.stockQty < qty) return { error: `"${line.product.name}" is out of stock`, status: 409 };
    const price = priceProductLine(line.product, Math.min(qty, 99));
    await prisma.productOrderItem.update({
      where: { id: lineId },
      data: { qty: Math.min(qty, 99), ...price },
    });
  }
  return serializeCart(await findCart(userId));
}

export type StoreCheckoutResult = { ok: true; orderRef: string } | { ok: false; error: string };

export async function checkoutStoreCart(
  userId: string,
  addressId: string,
  method: PaymentMethod,
): Promise<StoreCheckoutResult> {
  const cart = await findCart(userId);
  if (!cart || cart.items.length === 0) return { ok: false, error: "Your cart is empty" };

  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) return { ok: false, error: "Choose a delivery address" };

  // Re-snapshot every line from the live catalog (the price the customer pays
  // is always the platform price at checkout time) and verify availability.
  let totalPaise = 0;
  for (const line of cart.items) {
    if (!line.product.isActive) return { ok: false, error: `"${line.product.name}" is no longer available` };
    if (line.product.stockQty < line.qty) return { ok: false, error: `"${line.product.name}" is out of stock` };
    const price = priceProductLine(line.product, line.qty);
    totalPaise += price.totalPaise;
    if (price.unitPricePaise !== line.unitPricePaise) {
      await prisma.productOrderItem.update({ where: { id: line.id }, data: price });
    }
  }

  // Claim stock before money moves (same rule as the service checkout).
  try {
    await prisma.$transaction((tx) =>
      decrementStock(
        tx,
        cart.items.map((i) => ({ productId: i.productId, qty: i.qty })),
      ),
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "A product is out of stock" };
  }

  await prisma.productOrder.update({
    where: { id: cart.id },
    data: { addressId, totalPaise },
  });

  const authorized = await authorizeOrder({
    userId,
    bookingIds: [],
    productOrderId: cart.id,
    amountPaise: totalPaise,
    method,
    idempotencyKey: `store:${cart.id}`,
  });

  if (!authorized.ok) {
    // Give the claimed stock back — the cart survives for a retry.
    await prisma.$transaction(
      cart.items.map((i) =>
        prisma.product.update({
          where: { id: i.productId },
          data: { stockQty: { increment: i.qty } },
        }),
      ),
    );
    return { ok: false, error: authorized.error };
  }

  return { ok: true, orderRef: cart.orderRef };
}
