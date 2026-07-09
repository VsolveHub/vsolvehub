"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export default function CheckoutPage() {
  const [selectedDate, setSelectedDate] = useState("24 Jan");
  const [selectedTime, setSelectedTime] = useState("11:30 AM");

  const dates = [
    { day: "TODAY", date: "24 Jan" },
    { day: "THU", date: "25 Jan" },
    { day: "FRI", date: "26 Jan" },
    { day: "SAT", date: "27 Jan" },
    { day: "SUN", date: "28 Jan" },
  ];

  const timeslots = [
    "09:00 AM", "11:30 AM", "02:00 PM",
    "04:30 PM", "07:00 PM", "08:30 PM"
  ];

  const itemTotal = 105800; // ₹1058
  const discount = 8000;    // ₹80
  const coupon = 10000;     // ₹100
  const taxes = 4500;       // ₹45
  const finalTotal = itemTotal - discount - coupon + taxes; // ₹923

  return (
    <div className="checkout-page-wrapper">
      <h1 className="checkout-title">Secure Checkout</h1>
      
      <div className="checkout-split-layout">
        <div className="checkout-main-column">
          
          {/* Address Card */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-card-title">
                <FlaticonIcon name="marker" size={18} />
                <h2>Service Address</h2>
              </div>
              <button className="checkout-change-btn">Change</button>
            </div>
            <div className="checkout-address-box">
              <strong>Home</strong>
              <p>A-22, Lakshmi Narsimha Nagar Rd, Sri Nagar Colony, Hyderabad, Telangana 500045, India</p>
            </div>
          </div>

          {/* Slot Selection Card */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-card-title">
                <FlaticonIcon name="calendar" size={18} />
                <h2>Select Slot</h2>
              </div>
            </div>
            
            <div className="checkout-date-scroller">
              {dates.map((d) => (
                <button 
                  key={d.date} 
                  className={`checkout-date-btn ${selectedDate === d.date ? "active" : ""}`}
                  onClick={() => setSelectedDate(d.date)}
                >
                  <span className="day">{d.day}</span>
                  <span className="date">{d.date}</span>
                </button>
              ))}
            </div>

            <div className="checkout-time-grid">
              {timeslots.map((time) => (
                <button 
                  key={time} 
                  className={`checkout-time-btn ${selectedTime === time ? "active" : ""}`}
                  onClick={() => setSelectedTime(time)}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          {/* Service Summary Card */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-card-title">
                <FlaticonIcon name="shopping-bag" size={18} />
                <h2>Service Summary</h2>
              </div>
            </div>
            
            <div className="checkout-service-item">
              <img src="/basic_home_cleaning_hd.jpg" alt="Service" className="checkout-service-img" />
              <div className="checkout-service-info">
                <h3>Intense Cleaning (2 Bathrooms)</h3>
                <p>Takes approx 2 hrs • Professional grade chemicals</p>
              </div>
              <div className="checkout-service-price">
                <span className="price-new">₹978</span>
                <span className="price-old">₹1,058</span>
              </div>
            </div>

            <div className="checkout-coupon-applied">
              <div className="coupon-info">
                <FlaticonIcon name="ticket" size={16} color="#16a34a" />
                <span className="coupon-text">UCPROMO applied (₹100 off)</span>
              </div>
              <button className="coupon-remove-btn">Remove</button>
            </div>
          </div>
          
        </div>

        <div className="checkout-sidebar-column">
          
          <div className="checkout-payment-card">
            <h2>Payment Summary</h2>
            
            <div className="payment-row">
              <span>Item Total</span>
              <span>{formatPrice(itemTotal)}</span>
            </div>
            <div className="payment-row discount-row">
              <span>Item Discount</span>
              <span>-{formatPrice(discount)}</span>
            </div>
            <div className="payment-row discount-row">
              <span>Coupon (UCPROMO)</span>
              <span>-{formatPrice(coupon)}</span>
            </div>
            <div className="payment-row">
              <span>Taxes & Fee</span>
              <span>{formatPrice(taxes)}</span>
            </div>
            
            <div className="payment-divider" />
            
            <div className="payment-row total-row">
              <span>Total Amount</span>
              <span>{formatPrice(finalTotal)}</span>
            </div>

            <button className="checkout-proceed-btn">
              Proceed to Pay
              <FlaticonIcon name="arrow-right" size={18} color="#fff" />
            </button>

            <div className="checkout-trust-box">
              <FlaticonIcon name="shield-check" size={20} color="#16a34a" />
              <p>Safe & Secure payments. Easy cancellation up to 2 hours before.</p>
            </div>
          </div>

          <div className="checkout-help-card">
            <div className="help-icon-wrapper">
              <FlaticonIcon name="headset" size={20} color="#6366f1" />
            </div>
            <div className="help-text">
              <strong>Need help?</strong>
              <p>Chat with our booking expert</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
