"use client";

import { useState } from "react";

export default function AiCompanionPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([
    {
      role: "assistant",
      content:
        "Hi! I'm your AI financial companion. I can help you build financial models, analyze your runway, create scenarios, and explain financial concepts. What would you like to work on?",
    },
  ]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { role: "user", content: input }]);
    // TODO: Wire up to AI API
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "I'm not connected to an AI backend yet, but once I am, I'll be able to help you with financial planning, scenario modeling, and more. Stay tuned!",
      },
    ]);
    setInput("");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-surface-900">AI Companion</h1>
        <p className="mt-1 text-sm text-surface-500">
          Your always-on financial advisor
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-surface-0 border border-surface-200 text-surface-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your financials, build a scenario, get advice..."
          className="flex-1 rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
