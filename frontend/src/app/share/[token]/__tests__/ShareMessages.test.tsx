import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import ShareMessages from "../ShareMessages";

// Stub ChatMessage — we only care that ShareMessages iterates and never
// flips isStreaming to true. The component itself is covered elsewhere.
vi.mock("@/components/chat/ChatMessage", () => ({
  default: ({
    message,
    isStreaming,
  }: {
    message: UIMessage;
    isStreaming: boolean;
  }) => (
    <div
      data-testid={`msg-${message.id}`}
      data-role={message.role}
      data-streaming={String(isStreaming)}
    >
      {message.parts
        .filter((p) => p.type === "text")
        .map((p, i) => (
          <span key={i}>{(p as { type: "text"; text: string }).text}</span>
        ))}
    </div>
  ),
}));

function makeMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  } as UIMessage;
}

describe("ShareMessages", () => {
  it("renders each message in read-only mode (isStreaming=false)", () => {
    const messages = [
      makeMessage("m1", "user", "find TX solar"),
      makeMessage("m2", "assistant", "Found 3 projects."),
    ];
    render(<ShareMessages messages={messages} />);

    const m1 = screen.getByTestId("msg-m1");
    const m2 = screen.getByTestId("msg-m2");
    expect(m1).toBeInTheDocument();
    expect(m2).toBeInTheDocument();
    expect(m1).toHaveAttribute("data-streaming", "false");
    expect(m2).toHaveAttribute("data-streaming", "false");
  });

  it("shows an empty state when there are no messages", () => {
    render(<ShareMessages messages={[]} />);
    expect(
      screen.getByText(/this shared conversation is empty/i)
    ).toBeInTheDocument();
  });

  it("preserves user + assistant roles", () => {
    const messages = [makeMessage("m1", "user", "hi"), makeMessage("m2", "assistant", "hello")];
    render(<ShareMessages messages={messages} />);
    expect(screen.getByTestId("msg-m1")).toHaveAttribute("data-role", "user");
    expect(screen.getByTestId("msg-m2")).toHaveAttribute("data-role", "assistant");
  });
});
