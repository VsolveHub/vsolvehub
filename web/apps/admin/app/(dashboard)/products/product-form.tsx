"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createProduct, updateProduct, type ProductFormState } from "./actions";

type Option = { id: string; name: string };

export type ProductFormValues = {
  id?: string;
  name?: string;
  sku?: string;
  description?: string;
  productCategoryId?: string;
  brandId?: string | null;
  mrpPaise?: number;
  pricePaise?: number;
  gstRatePct?: number;
  stockQty?: number;
  isActive?: boolean;
  images?: string[];
  specs?: Record<string, string>;
};

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500";

export function ProductForm({
  values,
  categories,
  brands,
}: {
  values?: ProductFormValues;
  categories: Option[];
  brands: Option[];
}) {
  const isEdit = !!values?.id;
  const action = isEdit ? updateProduct : createProduct;
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(action, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok && !isEdit && state.productId) {
      router.push(`/products/${state.productId}`);
    }
  }, [state.ok, state.productId, isEdit, router]);

  return (
    <form action={formAction} className="grid gap-4">
      {isEdit ? <input type="hidden" name="id" value={values!.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Name</label>
          <input name="name" defaultValue={values?.name} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>SKU</label>
          <input name="sku" defaultValue={values?.sku} required placeholder="ELE-SW-001" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          name="description"
          defaultValue={values?.description}
          rows={2}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Product category</label>
          <select name="productCategoryId" defaultValue={values?.productCategoryId ?? ""} required className={inputCls}>
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Brand</label>
          <select name="brandId" defaultValue={values?.brandId ?? ""} className={inputCls}>
            <option value="">No brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className={labelCls}>MRP (₹)</label>
          <input
            name="mrp"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values?.mrpPaise !== undefined ? values.mrpPaise / 100 : undefined}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Selling price (₹)</label>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values?.pricePaise !== undefined ? values.pricePaise / 100 : undefined}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>GST rate (%)</label>
          <select name="gstRatePct" defaultValue={String(values?.gstRatePct ?? 18)} className={inputCls}>
            {[0, 5, 12, 18, 28].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Stock qty</label>
          <input
            name="stockQty"
            type="number"
            min="0"
            step="1"
            defaultValue={values?.stockQty ?? 0}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Image URLs (one per line)</label>
          <textarea
            name="images"
            defaultValue={(values?.images ?? []).join("\n")}
            rows={3}
            placeholder="https://…"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className={labelCls}>Specs (Key: Value per line)</label>
          <textarea
            name="specs"
            defaultValue={Object.entries(values?.specs ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
            rows={3}
            placeholder={"Rating: 16A\nColour: White"}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
        <input type="checkbox" name="isActive" defaultChecked={values?.isActive ?? true} className="h-4 w-4" />
        Active (visible to customers and technicians)
      </label>

      {state.error ? <p className="text-sm font-medium text-red-600">{state.error}</p> : null}
      {state.ok && isEdit ? <p className="text-sm font-medium text-green-700">Saved.</p> : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}
