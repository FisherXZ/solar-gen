"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatMessage from "./ChatMessage";
import SuggestedPrompts from "./SuggestedPrompts";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

export default function ChatInterface() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use a ref so the transport body closure always reads the latest value
  const conversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Stable transport — body uses a resolver function so it reads the ref each time
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${AGENT_API_URL}/api/chat`,
        body: () => ({ conversation_id: conversationIdRef.current }),
        fetch: async (url, init) => {
          const res = await globalThis.fetch(url, init);
          const id = res.headers.get("x-conversation-id");
          if (id) {
            conversationIdRef.current = id;
            setConversationId(id);
            loadConversations();
          }
          return res;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const { messages, sendMessage, status, setMessages } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    try {
      const res = await globalThis.fetch(`${AGENT_API_URL}/api/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        return data as Conversation[];
      }
    } catch {
      // silently fail
    }
    return [];
  }, []);

  // On mount: load conversations and resume the most recent one
  useEffect(() => {
    loadConversations().then((convs) => {
      if (convs.length > 0) {
        loadConversation(convs[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a past conversation
  async function loadConversation(id: string) {
    try {
      const res = await globalThis.fetch(
        `${AGENT_API_URL}/api/conversations/${id}/messages`
      );
      if (!res.ok) return;
      const data = await res.json();

      const loaded: UIMessage[] = data.map(
        (m: { id: string; role: string; content: string; parts?: unknown[] }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts:
            m.parts && m.parts.length > 0
              ? m.parts
              : [{ type: "text" as const, text: m.content }],
        })
      );

      setMessages(loaded);
      setConversationId(id);
      conversationIdRef.current = id;
      setSidebarOpen(false);
    } catch {
      // silently fail
    }
  }

  // Start a new conversation
  function handleNewConversation() {
    setMessages([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setSidebarOpen(false);
  }

  // Handle suggested prompt click
  function handlePromptSelect(prompt: string) {
    setInputValue(prompt);
  }

  // Handle form submit
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInputValue("");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <div
        className={`shrink-0 border-r border-slate-200 bg-white transition-all ${
          sidebarOpen ? "w-64" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex h-full w-64 flex-col">
          <div className="border-b border-slate-100 p-3">
            <button
              onClick={handleNewConversation}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              New conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`w-full border-b border-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                  conversationId === c.id ? "bg-blue-50" : ""
                }`}
              >
                <p className="truncate text-sm text-slate-700">
                  {c.title || "Untitled"}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(c.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            title="Toggle conversations"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h2 className="text-sm font-medium text-slate-700">
            EPC Discovery Chat
          </h2>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-800">
                  Solar Project Research Assistant
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Search projects, discover EPC contractors, and review findings.
                </p>
              </div>
              <SuggestedPrompts onSelect={handlePromptSelect} />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-3xl items-center gap-2"
          >
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about solar projects or EPC contractors..."
              className="h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
