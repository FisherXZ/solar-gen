import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareButton from "../ShareButton";

// Mock agentFetch — the ShareButton's only server dependency
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

import { agentFetch } from "@/lib/agent-fetch";
const mockFetch = agentFetch as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as unknown as Response;
}

describe("ShareButton", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // jsdom doesn't implement clipboard by default — stub it
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there is no conversation id", () => {
    const { container } = render(
      <ShareButton conversationId={null} isJobActive={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Share trigger when a conversation id is provided", () => {
    render(<ShareButton conversationId="conv-1" isJobActive={false} />);
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("disables the trigger while a job is active", () => {
    render(<ShareButton conversationId="conv-1" isJobActive={true} />);
    const btn = screen.getByRole("button", { name: /share/i });
    expect(btn).toBeDisabled();
  });

  it("opens the popover and shows 'Create share link' when not yet shared", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: null, shared_at: null, path: null })
    );

    render(<ShareButton conversationId="conv-1" isJobActive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /create share link/i })
      ).toBeInTheDocument()
    );
  });

  it("shows the shared URL + Copy button after POST success", async () => {
    // Initial GET returns "not shared yet"
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: null, shared_at: null, path: null })
    );
    // POST returns a fresh token
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        token: "tok-abc",
        shared_at: "2026-04-15T00:00:00Z",
        path: "/share/tok-abc",
      })
    );

    render(<ShareButton conversationId="conv-1" isJobActive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    const createBtn = await screen.findByRole("button", {
      name: /create share link/i,
    });
    fireEvent.click(createBtn);

    await waitFor(() => {
      const url = screen.getByDisplayValue(/\/share\/tok-abc$/);
      expect(url).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/i })).toBeInTheDocument();
  });

  it("shows a 'wait for response' message when backend returns 409", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: null, shared_at: null, path: null })
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: { error: "wait_for_completion" } }, 409)
    );

    render(<ShareButton conversationId="conv-1" isJobActive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /create share link/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/wait for the current response to finish/i)
      ).toBeInTheDocument();
    });
  });

  it("revokes via DELETE and returns to idle state", async () => {
    // Popover open: already shared
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        token: "tok-abc",
        shared_at: "2026-04-15T00:00:00Z",
        path: "/share/tok-abc",
      })
    );
    // DELETE succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: "revoked" }));

    render(<ShareButton conversationId="conv-1" isJobActive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    const stopBtn = await screen.findByRole("button", { name: /stop sharing/i });
    fireEvent.click(stopBtn);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /create share link/i })
      ).toBeInTheDocument()
    );
  });

  it("shows existing share link on popover open (no extra POST)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        token: "existing-tok",
        shared_at: "2026-04-15T00:00:00Z",
        path: "/share/existing-tok",
      })
    );

    render(<ShareButton conversationId="conv-1" isJobActive={false} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/existing-tok$/)).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1); // only the GET, no POST
  });
});
