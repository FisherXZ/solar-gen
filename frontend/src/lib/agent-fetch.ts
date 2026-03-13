import { createBrowserClient } from "@supabase/ssr";

const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

const STORAGE_KEY = "anthropic-api-key";

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetch wrapper for agent API calls.
 * Automatically includes:
 * - Authorization: Bearer <supabase_access_token>
 * - X-Anthropic-API-Key (if user has set a BYOK key)
 * - Prepends AGENT_API_URL to relative paths
 */
export async function agentFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  // Include BYOK API key if set
  if (typeof window !== "undefined") {
    const apiKey = localStorage.getItem(STORAGE_KEY);
    if (apiKey) {
      headers.set("X-Anthropic-API-Key", apiKey);
    }
  }

  const url = path.startsWith("http") ? path : `${AGENT_API_URL}${path}`;

  return globalThis.fetch(url, { ...init, headers });
}

/**
 * Returns auth headers for the agent API.
 * Useful for transports (like DefaultChatTransport) that manage their own fetch.
 */
export async function agentHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  if (typeof window !== "undefined") {
    const apiKey = localStorage.getItem(STORAGE_KEY);
    if (apiKey) {
      headers["X-Anthropic-API-Key"] = apiKey;
    }
  }

  return headers;
}

export { AGENT_API_URL };
