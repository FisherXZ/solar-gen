"use client";

import type { UIMessage } from "ai";
import ToolPart from "./ToolPart";

interface ChatMessageProps {
  message: UIMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-white border border-slate-200 text-slate-800"
        }`}
      >
        <div className="space-y-2">
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              return (
                <div
                  key={i}
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                >
                  {part.text}
                </div>
              );
            }
            if (part.type === "dynamic-tool") {
              return (
                <ToolPart
                  key={part.toolCallId || i}
                  toolInvocation={{
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    state: part.state === "output-available" ? "result" : "call",
                    input: part.input as Record<string, unknown> | undefined,
                    output: "output" in part ? (part.output as unknown) : undefined,
                  }}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
