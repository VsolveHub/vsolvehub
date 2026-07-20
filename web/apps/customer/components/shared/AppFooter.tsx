"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export function AppFooter() {
  return (
    <footer className="w-full bg-slate-900 pt-16 pb-8 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-16">
          {/* Brand Col */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            <Link href="/" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded-lg">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 shadow-md group-hover:scale-105 transition-transform">
                <img src="/logo-mark.png" alt="V Solve Hub" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-black text-white tracking-tight group-hover:text-[var(--color-brand-light)] transition-colors">Vsolve Hub</span>
            </Link>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">
              Your one-stop app for all doorstep services, vehicle maintenance, stays, and professional bookings.
            </p>
            <div className="flex gap-4">
              <a href="#" aria-label="Facebook" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-[var(--color-brand)] hover:text-white transition-all shadow-sm">
                <FlaticonIcon name="globe" size={18} />
              </a>
              <a href="#" aria-label="Twitter" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-[var(--color-brand)] hover:text-white transition-all shadow-sm">
                <FlaticonIcon name="comment-alt" size={18} />
              </a>
              <a href="#" aria-label="Instagram" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-[var(--color-brand)] hover:text-white transition-all shadow-sm">
                <FlaticonIcon name="camera" size={18} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Quick Links</h3>
            <ul className="flex flex-col gap-3">
              <li><Link href="/services" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Find Services</Link></li>
              <li><Link href="/profile/bookings" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">My Bookings</Link></li>
              <li><Link href="/support" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Support Helpdesk</Link></li>
              <li><Link href="/profile" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">My Account</Link></li>
            </ul>
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Popular Services</h3>
            <ul className="flex flex-col gap-3">
              <li><Link href="/services/home-services/home-cleaning" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Home Cleaning</Link></li>
              <li><Link href="/services/technician/electrician" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Electrician</Link></li>
              <li><Link href="/services/beauty-wellness/salon-at-home" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Salon At Home</Link></li>
              <li><Link href="/services/technician/plumbing" className="text-sm text-slate-400 font-medium hover:text-white hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Plumbing Services</Link></li>
            </ul>
          </div>

          {/* Contact & Support */}
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Contact Us</h3>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 text-slate-400">
                <span className="text-[var(--color-brand-light)]"><FlaticonIcon name="phone-call" size={16} /></span>
                <span className="text-sm font-semibold">+1 (800) 123-4567</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <span className="text-[var(--color-brand-light)]"><FlaticonIcon name="envelope" size={16} /></span>
                <span className="text-sm font-semibold">support@vsolvehub.com</span>
              </div>
              <div className="flex items-start gap-3 text-slate-400">
                <span className="text-[var(--color-brand-light)] mt-1"><FlaticonIcon name="marker" size={16} /></span>
                <span className="text-sm font-semibold leading-relaxed">Gachibowli, Hyderabad,<br/>Telangana, India</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-800/80">
          <p className="text-xs font-semibold text-slate-500">
            &copy; {new Date().getFullYear()} Vsolve Hub. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs font-semibold text-slate-500 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Privacy Policy</a>
            <a href="#" className="text-xs font-semibold text-slate-500 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] rounded">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
