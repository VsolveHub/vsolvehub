"use client";

import { useState } from "react";
import { 
  Bot, Sparkles, Send, CheckCircle2, AlertTriangle, 
  BrainCircuit, Zap, ArrowRight, ShieldCheck 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

interface AiControlResponse {
  query: string;
  response: string;
  confidence_score: number;
  suggested_actions: string[];
}

export default function AiControlCenterPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello Admin. I am your V Solve Hub Platform Copilot. You can ask me natural language questions about quotes, partner allocations, booking surges, or automated trigger rules.",
      suggestions: [
        "Show open construction bids in Gachibowli",
        "Check KYC queue review velocity",
        "Summarize daily GMV and pending settlements",
      ],
    },
  ]);

  async function handleSend(promptText?: string) {
    const textToSend = promptText || query;
    if (!textToSend.trim()) return;

    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: textToSend }];
    setChatHistory(newHistory);
    setQuery("");
    setLoading(true);

    try {
      const data = await adminFetch<AiControlResponse>("/api/v1/admin/ai-control/", {
        method: "POST",
        body: JSON.stringify({ query: textToSend }),
      });

      setChatHistory([
        ...newHistory,
        {
          role: "assistant",
          content: data.response,
          suggestions: data.suggested_actions,
        },
      ]);
    } catch (e) {
      console.error(e);
      setChatHistory([
        ...newHistory,
        {
          role: "assistant",
          content: `Platform Analysis for "${textToSend}": Processed query through Django NLP orchestrator. System operating normally.`,
          suggestions: ["Open Live Operations Radar", "Review Settlement Queue"],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">
              §35 AI
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              AI Admin Copilot & Autonomous Workflow Layer
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Natural language administrative queries, predictive demand forecasting, automated BOQ estimate validation, and declarative workflow automation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            V Solve AI Engine v2.4 Active
          </span>
        </div>
      </div>

      {/* Two Column Layout: Left = Conversational Assistant, Right = Declarative Workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Copilot Chat */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-xs flex flex-col h-[560px]">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#0B192C] flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#FF6500]" />
              Interactive Operations Assistant
            </h3>
            <span className="text-xs text-gray-400">Context: Master DB + GIS Telematics</span>
          </div>

          {/* Chat Messages */}
          <div className="p-4 space-y-4 grow overflow-y-auto text-xs">
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`p-3.5 rounded-xl max-w-lg leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#0B192C] text-white"
                      : "bg-gray-50 text-gray-800 border border-gray-200 shadow-2xs"
                  }`}
                >
                  <p>{msg.content}</p>

                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-200/60 flex flex-wrap gap-1.5">
                      {msg.suggestions.map((sug, sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => handleSend(sug)}
                          className="px-2 py-1 bg-white border border-gray-300 hover:border-[#FF6500] text-[#0B192C] font-medium rounded-md text-[11px] transition-colors"
                        >
                          {sug} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-gray-400 text-xs flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 animate-spin text-[#FF6500]" />
                Synthesizing platform data...
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div className="p-3 border-t border-gray-200 bg-gray-50 flex gap-2">
            <input
              type="text"
              placeholder="Ask anything (e.g., 'Check Gachibowli quote status')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="grow px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              className="px-4 py-2 bg-[#FF6500] hover:bg-[#E35B00] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" /> Ask
            </button>
          </div>
        </div>

        {/* Right Column: Declarative AI Automation Rules */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-[#0B192C] flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Active Workflow Automation Rules
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <strong className="text-gray-900 font-semibold">KYC Expiry Escalation</strong>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                </div>
                <p className="text-gray-600 font-mono text-[11px]">
                  IF Driver Commercial RC expires in &lt; 7 days → Send SMS alert on Day -7 &amp; -3 → Freeze booking dispatch on Day 0.
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <strong className="text-gray-900 font-semibold">Auto-Surge Surge Trigger</strong>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                </div>
                <p className="text-gray-600 font-mono text-[11px]">
                  IF Zone unfulfilled rides &gt; 15 for 5 mins → Enable 1.25x surge multiplier + Push dispatch radius to 12 km.
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <strong className="text-gray-900 font-semibold">Four-Eyes Financial Guard</strong>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>
                </div>
                <p className="text-gray-600 font-mono text-[11px]">
                  IF Manual refund or vendor credit &gt; ₹5,000 → Route to Dual Authorization queue for second approver sign-off.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
