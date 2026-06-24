import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotesPanel from "../src/components/NotesPanel";

function renderWithClient(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function mockFetch() {
  const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "PATCH") {
      const body = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 1, notes: body.notes })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotesPanel", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial notes in textarea", () => {
    renderWithClient(<NotesPanel offerId={1} initialNotes="hello world" />);
    const ta = screen.getByPlaceholderText(/Your private notes/) as HTMLTextAreaElement;
    expect(ta.value).toBe("hello world");
  });

  it("does NOT save when blur fires without changes", async () => {
    const fetchMock = mockFetch();
    renderWithClient(<NotesPanel offerId={1} initialNotes="unchanged" />);
    const ta = screen.getByPlaceholderText(/Your private notes/);
    fireEvent.blur(ta);
    // Give the async mutation a chance to fire (it shouldn't)
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT save when only whitespace changed (trimmed equality)", async () => {
    const fetchMock = mockFetch();
    renderWithClient(<NotesPanel offerId={1} initialNotes="hello" />);
    const ta = screen.getByPlaceholderText(/Your private notes/) as HTMLTextAreaElement;
    // Add trailing whitespace — trimmed value still equals lastSaved
    fireEvent.change(ta, { target: { value: "hello   " } });
    fireEvent.blur(ta);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves trimmed value on blur when content changed", async () => {
    const fetchMock = mockFetch();
    renderWithClient(<NotesPanel offerId={1} initialNotes="old" />);
    const ta = screen.getByPlaceholderText(/Your private notes/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "new notes  " } });
    fireEvent.blur(ta);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.notes).toBe("new notes");
  });

  it("shows Saved status after a successful save", async () => {
    mockFetch();
    renderWithClient(<NotesPanel offerId={1} initialNotes="x" />);
    const ta = screen.getByPlaceholderText(/Your private notes/);
    fireEvent.change(ta, { target: { value: "y" } });
    fireEvent.blur(ta);
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("shows Save failed on patch error", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" })
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithClient(<NotesPanel offerId={1} initialNotes="x" />);
    const ta = screen.getByPlaceholderText(/Your private notes/);
    fireEvent.change(ta, { target: { value: "y" } });
    fireEvent.blur(ta);
    await waitFor(() => expect(screen.getByText(/Save failed/)).toBeInTheDocument());
  });

  it("does not save on every keystroke (only on blur)", async () => {
    const fetchMock = mockFetch();
    renderWithClient(<NotesPanel offerId={1} initialNotes="x" />);
    const ta = screen.getByPlaceholderText(/Your private notes/);
    fireEvent.change(ta, { target: { value: "a" } });
    fireEvent.change(ta, { target: { value: "ab" } });
    fireEvent.change(ta, { target: { value: "abc" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.blur(ta);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("resets state when offerId/initialNotes change", () => {
    const { rerender } = renderWithClient(<NotesPanel offerId={1} initialNotes="one" />);
    const ta = screen.getByPlaceholderText(/Your private notes/) as HTMLTextAreaElement;
    expect(ta.value).toBe("one");
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NotesPanel offerId={2} initialNotes="two" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const ta2 = screen.getByPlaceholderText(/Your private notes/) as HTMLTextAreaElement;
    expect(ta2.value).toBe("two");
  });
});