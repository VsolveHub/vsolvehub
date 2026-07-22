"use server";

// Product catalog server actions. Pricing lives ONLY here (admin side) — the
// customer and partner apps read it, never write it. Every mutation logs an
// AdminAction (audit log keys loosely by id, product/mapping ids reuse the
// partnerId column).

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@vsolve/db";
import { requireAdmin } from "@/lib/auth";

export type ProductFormState = { error?: string; ok?: boolean; productId?: string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePaise(value: FormDataEntryValue | null): number | null {
  const rupees = Number(String(value ?? "").trim());
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

type ParsedProduct = {
  name: string;
  sku: string;
  description: string;
  productCategoryId: string;
  brandId: string | null;
  mrpPaise: number;
  pricePaise: number;
  gstRatePct: number;
  stockQty: number;
  isActive: boolean;
  images: string;
  specs: string;
};

function parseProductForm(formData: FormData): ParsedProduct | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const productCategoryId = String(formData.get("productCategoryId") ?? "");
  const brandId = String(formData.get("brandId") ?? "") || null;
  const mrpPaise = parsePaise(formData.get("mrp"));
  const pricePaise = parsePaise(formData.get("price"));
  const gstRatePct = Number(formData.get("gstRatePct") ?? 18);
  const stockQty = Number(formData.get("stockQty") ?? 0);
  const isActive = formData.get("isActive") === "on";
  const imagesRaw = String(formData.get("images") ?? "").trim();
  const specsRaw = String(formData.get("specs") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!sku) return { error: "SKU is required." };
  if (!productCategoryId) return { error: "Choose a product category." };
  if (mrpPaise === null || mrpPaise <= 0) return { error: "Enter a valid MRP." };
  if (pricePaise === null || pricePaise <= 0) return { error: "Enter a valid selling price." };
  if (pricePaise > mrpPaise) return { error: "Selling price cannot exceed MRP." };
  if (!Number.isInteger(gstRatePct) || gstRatePct < 0 || gstRatePct > 28)
    return { error: "GST rate must be between 0 and 28%." };
  if (!Number.isInteger(stockQty) || stockQty < 0) return { error: "Stock must be 0 or more." };

  // Images: one URL per line.
  const images = JSON.stringify(
    imagesRaw ? imagesRaw.split("\n").map((s) => s.trim()).filter(Boolean) : [],
  );

  // Specs: "Key: Value" per line.
  const specs: Record<string, string> = {};
  if (specsRaw) {
    for (const line of specsRaw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) specs[k] = v;
      }
    }
  }

  return {
    name,
    sku,
    description,
    productCategoryId,
    brandId,
    mrpPaise,
    pricePaise,
    gstRatePct,
    stockQty,
    isActive,
    images,
    specs: JSON.stringify(specs),
  };
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const admin = await requireAdmin();
  const parsed = parseProductForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...parsed, slug: slugify(parsed.name) },
      });
      await tx.adminAction.create({
        data: { adminId: admin.id, partnerId: created.id, action: "PRODUCT_CREATED", reason: created.name },
      });
      return created;
    });
    revalidatePath("/products");
    return { ok: true, productId: product.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A product with this SKU or name already exists." };
    }
    return { error: "Something went wrong." };
  }
}

export async function updateProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Invalid request." };
  const parsed = parseProductForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: parsed });
      await tx.adminAction.create({
        data: { adminId: admin.id, partnerId: id, action: "PRODUCT_UPDATED", reason: updated.name },
      });
    });
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { ok: true, productId: id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A product with this SKU already exists." };
    }
    return { error: "Something went wrong." };
  }
}

export async function toggleProductActive(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { isActive: !product.isActive } });
    await tx.adminAction.create({
      data: {
        adminId: admin.id,
        partnerId: id,
        action: product.isActive ? "PRODUCT_DEACTIVATED" : "PRODUCT_ACTIVATED",
        reason: product.name,
      },
    });
  });
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
}

export type SimpleFormState = { error?: string; ok?: boolean };

export async function createProductCategory(
  _prev: SimpleFormState,
  formData: FormData,
): Promise<SimpleFormState> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  try {
    const created = await prisma.productCategory.create({
      data: { name, slug: slugify(name), icon: String(formData.get("icon") ?? "").trim() || null },
    });
    await prisma.adminAction.create({
      data: { adminId: admin.id, partnerId: created.id, action: "PRODUCT_CATEGORY_CREATED", reason: name },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "This category already exists." };
    }
    return { error: "Something went wrong." };
  }
  revalidatePath("/products");
  return { ok: true };
}

export async function createBrand(
  _prev: SimpleFormState,
  formData: FormData,
): Promise<SimpleFormState> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  try {
    const created = await prisma.brand.create({ data: { name, slug: slugify(name) } });
    await prisma.adminAction.create({
      data: { adminId: admin.id, partnerId: created.id, action: "BRAND_CREATED", reason: name },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "This brand already exists." };
    }
    return { error: "Something went wrong." };
  }
  revalidatePath("/products");
  return { ok: true };
}

// ── Service → product mapping ──

export async function addMapping(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const admin = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const target = String(formData.get("target") ?? ""); // "service:<id>" | "subcategory:<id>"
  const featured = formData.get("featured") === "on";
  if (!productId || !target) return { error: "Pick a service or subcategory." };

  const [kind, targetId] = target.split(":");
  if (!targetId || (kind !== "service" && kind !== "subcategory")) return { error: "Invalid target." };

  try {
    const created = await prisma.serviceProductMap.create({
      data: {
        productId,
        serviceId: kind === "service" ? targetId : null,
        subCategoryId: kind === "subcategory" ? targetId : null,
        featured,
      },
    });
    await prisma.adminAction.create({
      data: { adminId: admin.id, partnerId: created.id, action: "MAPPING_ADDED", reason: productId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "This mapping already exists." };
    }
    return { error: "Something went wrong." };
  }
  revalidatePath(`/products/${productId}`);
  return { ok: true };
}

export async function removeMapping(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const map = await prisma.serviceProductMap.delete({ where: { id } }).catch(() => null);
  if (map) {
    await prisma.adminAction.create({
      data: { adminId: admin.id, partnerId: id, action: "MAPPING_REMOVED", reason: map.productId },
    });
    revalidatePath(`/products/${map.productId}`);
  }
}
