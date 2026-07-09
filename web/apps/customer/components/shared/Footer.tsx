import Link from "next/link";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export function Footer() {
  return (
    <footer className="desktop-footer">
      <div className="footer-container">
        <div className="footer-columns">
          {/* Brand Column */}
          <div className="footer-col brand-col">
            <Link href="/" className="footer-brand">
              <span className="brand-name text-white">ExpertEase</span>
            </Link>
            <p className="footer-desc">
              Your trusted partner for home services, maintenance, and beauty needs, delivered right to your door with professional excellence.
            </p>
          </div>

          {/* Company Column */}
          <div className="footer-col">
            <h4 className="footer-title">COMPANY</h4>
            <Link href="/about" className="footer-link">About Us</Link>
            <Link href="/terms" className="footer-link">Terms of Service</Link>
            <Link href="/privacy" className="footer-link">Privacy Policy</Link>
            <Link href="/careers" className="footer-link">Careers</Link>
          </div>

          {/* Customers Column */}
          <div className="footer-col">
            <h4 className="footer-title">FOR CUSTOMERS</h4>
            <Link href="/support" className="footer-link">Help Center</Link>
            <Link href="/reviews" className="footer-link">Reviews</Link>
            <Link href="/contact" className="footer-link">Contact Us</Link>
            <Link href="/services" className="footer-link">Service Categories</Link>
          </div>

          {/* App Column */}
          <div className="footer-col">
            <h4 className="footer-title">DOWNLOAD OUR APP</h4>
            <div className="app-buttons">
              <button className="app-store-btn">
                <span className="app-btn-icon">🍎</span>
                <div className="app-btn-text">
                  <span className="app-btn-sub">Download on the</span>
                  <span className="app-btn-main">App Store</span>
                </div>
              </button>
              <button className="app-store-btn">
                <span className="app-btn-icon">▶️</span>
                <div className="app-btn-text">
                  <span className="app-btn-sub">GET IT ON</span>
                  <span className="app-btn-main">Google Play</span>
                </div>
              </button>
            </div>
            <div className="social-links">
              <a href="#" className="social-icon"><FlaticonIcon name="twitter" size={16} /></a>
              <a href="#" className="social-icon"><FlaticonIcon name="share" size={16} /></a>
              <a href="#" className="social-icon"><FlaticonIcon name="instagram" size={16} /></a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} ExpertEase Professional Services. All rights reserved.</p>
          <div className="footer-stats">
            <span>* Presence in 60+ cities</span>
            <span>10M+ Happy Customers</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
