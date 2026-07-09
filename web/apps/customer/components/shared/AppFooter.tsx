"use client";

import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          {/* Brand Col */}
          <div className="footer-col brand-col">
            <Link href="/" className="footer-logo">
              <img src="/logo-mark.png" alt="V Solve Hub" className="footer-logo-img" />
              <span>Vsolve Hub</span>
            </Link>
            <p className="footer-tagline">
              Your one-stop app for all doorstep services, vehicle maintenance, stays, and professional bookings.
            </p>
            <div className="footer-socials">
              <a href="#" aria-label="Facebook">📘</a>
              <a href="#" aria-label="Twitter">🐦</a>
              <a href="#" aria-label="Instagram">📸</a>
              <a href="#" aria-label="LinkedIn">💼</a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="footer-col">
            <h3>Quick Links</h3>
            <ul>
              <li><Link href="/">Find Services</Link></li>
              <li><Link href="/profile/bookings">My Bookings</Link></li>
              <li><Link href="/support">Support Helpdesk</Link></li>
              <li><Link href="/profile">My Account</Link></li>
            </ul>
          </div>

          {/* Categories */}
          <div className="footer-col">
            <h3>Popular Services</h3>
            <ul>
              <li><Link href="/services/home-services/home-cleaning">Home Cleaning</Link></li>
              <li><Link href="/services/technician/electrician">Electrician</Link></li>
              <li><Link href="/services/beauty-wellness/salon-at-home">Salon At Home</Link></li>
              <li><Link href="/services/technician/plumbing">Plumbing Services</Link></li>
            </ul>
          </div>

          {/* Contact & Support */}
          <div className="footer-col">
            <h3>Contact Us</h3>
            <p className="contact-info">📞 +1 (800) 123-4567</p>
            <p className="contact-info">✉️ support@vsolvehub.com</p>
            <p className="contact-info">📍 Gachibowli, Hyderabad, India</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Vsolve Hub. All rights reserved.</p>
          <div className="footer-bottom-links">
            <a href="#">Privacy Policy</a>
            <span>·</span>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
