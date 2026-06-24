import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ChatWindow from "../src/components/ChatWindow";

function renderWithClient(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

type Msg = { id: number; offerId: number; role: "user" | "assistant"; content: string; openwebuiChatId: string | null; createdAt: string };

function mockFetchStateful() {
  const messages: Msg[] = [];
  const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    if (url.endsWith("/api/offers/1/messages")) {
      if (method === "POST") {
        const body = JSON.parse(init.body as string);
        messages.push({ id: messages.length + 1, offerId: 1, role: "user", content: body.content, openwebuiChatId: "c1", createdAt: new Date().toISOString() });
        messages.push({ id: messages.length + 1, offerId: 1, role: "assistant", content: "Klar, kürzer.", openwebuiChatId: "c1", createdAt: new Date().toISOString() });
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ user: { id: 1 }, assistant: { id: 2, content: "Klar, kürzer.", chatId: "c1" } })
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([...messages]) });
    }
    if (url.endsWith("/api/offers/1/generate") && method === "POST") {
      messages.push({ id: messages.length + 1, offerId: 1, role: "assistant", content: "Sehr geehrte Damen und Herren...", openwebuiChatId: "c1", createdAt: new Date().toISOString() });
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 1,
          role: "assistant",
          content: "Sehr geehrte Damen und Herren...",
          chatId: "c1",
          createdAt: new Date().toISOString()
        })
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([...messages]) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { messages, fetchMock };
}

describe("ChatWindow", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows Generate button when empty and no thread", () => {
    renderWithClient(<ChatWindow offerId={1} hasExistingThread={false} />);
    expect(screen.getByText("Generate initial proposal")).toBeInTheDocument();
  });

  it("clicking Generate calls POST /generate and shows assistant message", async () => {
    mockFetchStateful();
    renderWithClient(<ChatWindow offerId={1} hasExistingThread={false} />);
    fireEvent.click(screen.getByText("Generate initial proposal"));
    await waitFor(() => {
      expect(screen.getByText("Sehr geehrte Damen und Herren...")).toBeInTheDocument();
    });
  });

  it("submit sends user message and shows assistant reply", async () => {
    const { messages } = mockFetchStateful();
    // Pre-seed an initial assistant message so the thread exists
    messages.push({ id: 1, offerId: 1, role: "assistant", content: "Initial draft", openwebuiChatId: "c1", createdAt: "2026-06-01T00:00:00Z" });

    renderWithClient(<ChatWindow offerId={1} hasExistingThread={true} />);
    await waitFor(() => expect(screen.getByText("Initial draft")).toBeInTheDocument());

    const textarea = screen.getByPlaceholderText(/Ask for changes/);
    fireEvent.change(textarea, { target: { value: "Make it shorter" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Klar, kürzer.")).toBeInTheDocument();
    });
  });
});