"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
    // Add user message
    const userMsgId = Math.random().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: "user", text: reply },
    ]);

    // Simulate bot response after a brief pause
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
        {
          id: Math.random().toString(),
          sender: "bot",
          text: botResponse,
          link: botLink,
        },
      ]);
      setSuggestedActions(nextSuggestions);
    }, 600);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        className={`ai-assistant-fab ${isOpen ? "ai-assistant-fab--active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle AI assistant"
      >
        {isOpen ? (
          <span style={{ fontSize: "1.25rem", fontWeight: "bold" }}>&times;</span>
        ) : (
          <span className="flex-align justify-center relative">
            <FlaticonIcon name="circle-user" size={24} color="#fff" />
            <span className="ai-pulse-dot" />
          </span>
        )}
      </button>

      {/* Chat Pane */}
      {isOpen && (
        <div className="ai-chat-window">
          {/* Header */}
          <div className="ai-chat-header">
            <div className="flex-align gap-sm">
              <div className="ai-chat-avatar">🤖</div>
              <div>
                <h3 className="ai-chat-title">V-AI assistant</h3>
                <span className="ai-chat-status">Always online</span>
              </div>
            </div>
            <button
              type="button"
              className="ai-chat-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              &times;
            </button>
          </div>

          {/* Messages */}
          <div className="ai-chat-messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`ai-message-row ${
                  msg.sender === "user" ? "ai-message-row--user" : "ai-message-row--bot"
                }`}
              >
                {msg.sender === "bot" && <span className="ai-msg-avatar" aria-hidden>🤖</span>}
                <div className="ai-message-bubble">
                  <p className="ai-message-text">{msg.text}</p>
                  {msg.link && (
                    <Link
                      href={msg.link.href}
                      className="ai-message-link-btn"
                      onClick={() => setIsOpen(false)}
                    >
                      {msg.link.label} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Quick Replies */}
          {suggestedActions.length > 0 && (
            <div className="ai-chat-suggestions">
              <span className="ai-suggestions-title" aria-hidden>Suggested questions:</span>
              <div className="ai-suggestions-list">
                {suggestedActions.map((act) => (
                  <button
                    key={act}
                    type="button"
                    className="ai-suggestion-chip"
                    onClick={() => handleQuickReply(act)}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
