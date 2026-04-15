"use client";

import type { UIMessage } from "ai";
import ChatMessage from "@/components/chat/ChatMessage";

/**
 * Renders shared messages using the existing ChatMessage component in a
 * read-only (non-streaming) mode. A thin client wrapper is required because
 * ChatMessage uses client-only hooks.
 */
export default function ShareMessages({ messages }: { messages: UIMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-center text-sm text-text-tertiary">
        This shared conversation is empty.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} isStreaming={false} />
      ))}
    </div>
  );
}
