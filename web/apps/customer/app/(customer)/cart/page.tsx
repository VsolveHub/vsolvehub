"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

type CartItem = {
  id: string;
  name: string;
  pricePaise: number;
  quantity: number;
  image: string;
};

const INITIAL_CART: CartItem[] = [
  {
    id: "1",
    name: "Deep Home Cleaning",
    pricePaise: 499900,
    quantity: 1,
    image: "/basic_home_cleaning_hd.jpg",
  },
  {
    id: "2",
    name: "AC Servicing",
    pricePaise: 59900,
    quantity: 2,
    image: "/ac_general_service_hd.jpg",
  },
];

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>(INITIAL_CART);

  const updateQuantity = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQ = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQ };
        }
        return item;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const subtotalPaise = items.reduce((acc, item) => acc + item.pricePaise * item.quantity, 0);
  const taxesPaise = Math.round(subtotalPaise * 0.18); // 18% GST
  const discountPaise = items.length > 0 ? 50000 : 0; // ₹500 discount if items exist
  const totalPaise = subtotalPaise + taxesPaise - discountPaise;

  if (items.length === 0) {
    return (
      <div className="cart-empty-state">
        <div className="cart-empty-icon">🛒</div>
        <h1>Your cart is empty</h1>
        <p>Looks like you haven't added any services yet.</p>
        <Link href="/" className="cart-empty-btn">
          Browse Services
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-page-wrapper">
      <div className="cart-header">
        <h1>Your Cart</h1>
        <p>Review your services and proceed to checkout.</p>
      </div>

      <div className="cart-split-layout">
        <div className="cart-items-column">
          <div className="cart-items-list">
            {items.map((item) => (
              <div key={item.id} className="cart-item-card">
                <div className="cart-item-image-wrapper">
                  <img src={item.image} alt={item.name} className="cart-item-image" />
                </div>
                <div className="cart-item-details">
                  <h3>{item.name}</h3>
                  <p className="cart-item-price">{formatPrice(item.pricePaise)}</p>
                </div>
                <div className="cart-item-actions">
                  <div className="cart-quantity-control">
                    <button onClick={() => updateQuantity(item.id, -1)}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)}>+</button>
                  </div>
                  <button className="cart-remove-btn" onClick={() => removeItem(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="cart-instructions-card">
            <h3>📝 Any instructions for the professional?</h3>
            <textarea placeholder="e.g. Please bring extra long ladder..." rows={3} />
          </div>
        </div>

        <div className="cart-summary-column">
          <div className="cart-summary-card">
            <h2>Order Summary</h2>
            <div className="cart-summary-row">
              <span>Item Total</span>
              <span>{formatPrice(subtotalPaise)}</span>
            </div>
            <div className="cart-summary-row discount">
              <span>V Solve Discount</span>
              <span>-{formatPrice(discountPaise)}</span>
            </div>
            <div className="cart-summary-row">
              <span>Taxes & Fee</span>
              <span>{formatPrice(taxesPaise)}</span>
            </div>
            <div className="cart-summary-divider" />
            <div className="cart-summary-row total">
              <span>Total to pay</span>
              <span>{formatPrice(totalPaise)}</span>
            </div>

            <div className="cart-savings-banner">
              🎉 You are saving {formatPrice(discountPaise)} on this order!
            </div>

            <Link href="/checkout" className="cart-checkout-btn text-center no-underline inline-block w-full">
              Proceed to Checkout
            </Link>
          </div>
          
          <div className="cart-trust-badges">
            <div className="trust-badge">
              <span>💳</span> Secure Payments
            </div>
            <div className="trust-badge">
              <span>🛡️</span> V Solve Guarantee
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
