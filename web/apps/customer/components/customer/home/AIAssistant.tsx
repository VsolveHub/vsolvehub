"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type Message = {
  id: string;
  sender: "user" | "bot";
  text: string;
  link?: { label: string; href: string };
};

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Hi! I'm V-AI, your personal assistant. How can I help you today?",
    },
  ]);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    "Book an Electrician",
    "How do V Coins work?",
    "Track active bookings",
    "Contact Customer Care",
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleQuickReply = (reply: string) => {
    const userMsgId = Math.random().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: "user", text: reply },
    ]);

    setTimeout(() => {
      let botResponse = "";
      let botLink: { label: string; href: string } | undefined;
      let nextSuggestions: string[] = [];

      switch (reply) {
        case "Book an Electrician":
          botResponse = "I can help with that! We have verified electricians available for installations, wiring, fan repairs, or general maintenance. Booking takes less than 2 minutes.";
          botLink = { label: "Go to Electrician Booking", href: "/services/technician/electrician" };
          nextSuggestions = ["Salon At Home", "Cleaning Services", "How do V Coins work?"];
          break;
        case "How do V Coins work?":
          botResponse = "You earn V Coins on every booking completed! Each coin is worth real credit. You also receive 100 V Coins for every friend you refer. You can check your rewards under Profile.";
          botLink = { label: "View Rating & Rewards", href: "/profile/rating" };
          nextSuggestions = ["Book an Electrician", "Contact Customer Care"];
          break;
        case "Track active bookings":
          botResponse = "All active service, vehicle, and stay bookings can be tracked on your dashboard timeline or via the 'My Bookings' tab below.";
          botLink = { label: "My Bookings Tracker", href: "/profile/bookings" };
          nextSuggestions = ["How do V Coins work?", "Contact Customer Care"];
          break;
        case "Contact Customer Care":
          botResponse = "Need urgent help? You can call or email our 24/7 support team. Click the link below to get support contacts.";
          botLink = { label: "Get Support Info", href: "/profile/help" };
          nextSuggestions = ["Book an Electrician", "How do V Coins work?"];
          break;
        case "Salon At Home":
          botResponse = "Indulge in professional salon and spa treatments at home. Clean, single-use kits and premium hygiene.";
          botLink = { label: "Browse Salon Packages", href: "/services?category=beauty-wellness" };
          nextSuggestions = ["Book an Electrician", "How do V Coins work?"];
          break;
        case "Cleaning Services":
          botResponse = "Deep clean your home, bathroom, kitchen, or sofa with professional high-pressure jet equipment.";
          botLink = { label: "Browse Cleaning", href: "/services?q=cleaning" };
          nextSuggestions = ["How do V Coins work?", "Contact Customer Care"];
          break;
        default:
          botResponse = "Sure, you can browse all services or get in touch with our live support for specific inquiries.";
          botLink = { label: "Browse All Services", href: "/services" };
          nextSuggestions = ["Book an Electrician", "How do V Coins work?", "Track active bookings"];
          break;
      }

      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), sender: "bot", text: botResponse, link: botLink },
      ]);
      setSuggestedActions(nextSuggestions);
    }, 600);
  };

  return (
    <>
      {/* Floating action button — clears the mobile bottom nav */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close assistant" : "Open AI assistant"}
        aria-expanded={isOpen}
        className="fixed bottom-24 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-dark)] text-white shadow-xl shadow-[var(--color-brand)]/30 transition-shadow hover:shadow-2xl sm:bottom-6 sm:right-6"
      >
        {isOpen ? (
          <span className="text-2xl font-bold leading-none">&times;</span>
        ) : (
          <span className="relative flex items-center justify-center">
            <FlaticonIcon name="circle-user" size={24} color="#fff" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--color-brand-dark)] bg-[var(--color-brand-accent)]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand-accent)]" />
            </span>
          </span>
        )}
      </motion.button>

      {/* Chat pane */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed bottom-40 right-4 z-[60] flex h-[min(70vh,540px)] w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-2xl sm:bottom-24 sm:right-6"
            role="dialog"
            aria-label="V-AI assistant"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-dark)] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-lg backdrop-blur-md">
                  🤖
                </span>
                <div>
                  <h3 className="text-sm font-black leading-tight">V-AI assistant</h3>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Always online
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                &times;
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto bg-[#f8fafc] px-4 py-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${
                    msg.sender === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  {msg.sender === "bot" && (
                    <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-light)] text-sm">
                      🤖
                    </span>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] font-medium leading-relaxed shadow-sm ${
                      msg.sender === "user"
                        ? "rounded-br-md bg-[var(--color-brand)] text-white"
                        : "rounded-bl-md bg-white text-gray-700"
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.link && (
                      <Link
                        href={msg.link.href}
                        onClick={() => setIsOpen(false)}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand-light)] px-3 py-1.5 text-xs font-black text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white"
                      >
                        {msg.link.label} →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested quick replies */}
            {suggestedActions.length > 0 && (
              <div className="border-t border-gray-100 bg-white px-4 py-3">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Suggested
                </span>
                <div className="flex flex-wrap gap-2">
                  {suggestedActions.map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => handleQuickReply(act)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand)]"
                    >
                      {act}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
