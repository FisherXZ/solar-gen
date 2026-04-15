import type { Metadata } from "next";
import type { UIMessage } from "ai";
import Link from "next/link";
import ShareMessages from "./ShareMessages";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL ||
  process.env.AGENT_API_URL ||
  "http://localhost:8000";

interface SharedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: Array<Record<string, unknown>>;
  created_at: string;
}

interface SharedConversation {
  id: string;
  title: string | null;
  shared_at: string;
}

interface SharedSnapshot {
  conversation: SharedConversation;
  messages: SharedMessage[];
}

async function fetchSnapshot(token: string): Promise<SharedSnapshot | null> {
  try {
    const res = await fetch(`${AGENT_API_URL}/api/share/${token}`, {
      // Short cache to keep revocation effective; public pages can tolerate brief staleness.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SharedSnapshot;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  const snap = await fetchSnapshot(token);
  const title = snap?.conversation?.title?.trim() || "Shared conversation";

  return {
    title: `${title} · Civ Robotics`,
    description: "A research conversation shared from Civ Robotics.",
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: "A research conversation shared from Civ Robotics.",
      images: ["/og-share.png"],
      siteName: "Civ Robotics",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: "A research conversation shared from Civ Robotics.",
      images: ["/og-share.png"],
    },
  };
}

export default async function SharedConversationPage(
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const snap = await fetchSnapshot(token);

  if (!snap) {
    return <NotFoundView />;
  }

  const { conversation, messages } = snap;
  const uiMessages: UIMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts:
      Array.isArray(m.parts) && m.parts.length > 0
        ? (m.parts as UIMessage["parts"])
        : ([{ type: "text", text: m.content }] as UIMessage["parts"]),
  }));

  const title = conversation.title?.trim() || "Shared conversation";
  const sharedAt = formatDate(conversation.shared_at);

  return (
    <div className="min-h-screen bg-surface-primary">
      {/* Header */}
      <header className="border-b border-border-subtle bg-surface-raised">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Shared conversation
            </p>
            <h1 className="mt-0.5 font-serif text-xl text-text-primary">
              {title}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-text-tertiary">Snapshot</p>
            <p className="text-xs text-text-secondary">{sharedAt}</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ShareMessages messages={uiMessages} />
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle bg-surface-raised">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-accent-amber"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
              />
            </svg>
            <span className="text-xs text-text-secondary">
              Shared from <span className="text-text-primary">Civ Robotics</span>
            </span>
          </div>
          <Link
            href="/"
            className="text-xs text-text-tertiary hover:text-accent-amber"
          >
            Learn more →
          </Link>
        </div>
      </footer>
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-primary px-4">
      <div className="max-w-md text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
          Not available
        </p>
        <h1 className="mt-2 font-serif text-2xl text-text-primary">
          This conversation is no longer shared
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          The owner may have revoked the link, or it was never valid. If you
          received this link from a colleague, ask them to share it again.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-accent-amber hover:underline"
        >
          Go to Civ Robotics →
        </Link>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
