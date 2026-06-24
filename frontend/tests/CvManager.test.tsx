import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const getActiveCv = vi.fn();
const listCvHistory = vi.fn();
const uploadCv = vi.fn();
const activateCv = vi.fn();
const deleteCv = vi.fn();

vi.mock("../src/api/cv", () => ({
  getActiveCv: (...a: unknown[]) => getActiveCv(...a),
  listCvHistory: (...a: unknown[]) => listCvHistory(...a),
  uploadCv: (...a: unknown[]) => uploadCv(...a),
  activateCv: (...a: unknown[]) => activateCv(...a),
  deleteCv: (...a: unknown[]) => deleteCv(...a),
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024
}));

import CvManager from "../src/components/CvManager";

function renderWithProviders(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } }
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

const cv = (over: Partial<{ id: number; filename: string; size: number; contentType: string; createdAt: string; isActive: boolean; contentPreview?: string }> = {}) => ({
  id: 1,
  filename: "cv.pdf",
  size: 1024,
  contentType: "application/pdf",
  createdAt: "2026-06-01T00:00:00.000Z",
  isActive: true,
  contentPreview: "preview",
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveCv.mockResolvedValue(null);
  listCvHistory.mockResolvedValue([]);
  uploadCv.mockResolvedValue(cv({ id: 2, filename: "new.pdf", isActive: true }));
  activateCv.mockResolvedValue(undefined);
  deleteCv.mockResolvedValue(undefined);
});

describe("CvManager", () => {
  it("renders empty state when no active CV", async () => {
    renderWithProviders(<CvManager />);
    expect(await screen.findByText("No CV uploaded yet.")).toBeInTheDocument();
  });

  it("renders current active CV metadata", async () => {
    getActiveCv.mockResolvedValue(cv({ filename: "mine.pdf", size: 2048 }));
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(screen.getByText("mine.pdf")).toBeInTheDocument());
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("upload sends PDF and triggers refetch", async () => {
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(getActiveCv).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["%PDF-1.4 body"], "x.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploadCv).toHaveBeenCalledWith(file));
  });

  it("rejects non-PDF with client-side validation", async () => {
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(getActiveCv).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hi"], "x.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("Please choose a PDF file.")).toBeInTheDocument());
    expect(uploadCv).not.toHaveBeenCalled();
  });

  it("rejects file > 5 MB client-side", async () => {
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(getActiveCv).toHaveBeenCalled());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [big] } });
    await waitFor(() => expect(screen.getByText("File too large (max 5 MB).")).toBeInTheDocument());
    expect(uploadCv).not.toHaveBeenCalled();
  });

  it("shows history rows with Activate for inactive CV", async () => {
    listCvHistory.mockResolvedValue([
      cv({ id: 2, filename: "new.pdf", isActive: true }),
      cv({ id: 1, filename: "old.pdf", isActive: false, contentPreview: undefined })
    ]);
    getActiveCv.mockResolvedValue(cv({ id: 2, filename: "new.pdf" }));
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(screen.getByText("old.pdf")).toBeInTheDocument());
    expect(screen.getByText("Activate")).toBeInTheDocument();
  });

  it("activate button calls PATCH and refetches", async () => {
    listCvHistory.mockResolvedValue([
      cv({ id: 2, filename: "new.pdf", isActive: true }),
      cv({ id: 1, filename: "old.pdf", isActive: false, contentPreview: undefined })
    ]);
    getActiveCv.mockResolvedValue(cv({ id: 2, filename: "new.pdf" }));
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(screen.getByText("Activate")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Activate"));
    await waitFor(() => expect(activateCv).toHaveBeenCalledWith(1));
  });

  it("delete shows confirm then deletes", async () => {
    listCvHistory.mockResolvedValue([
      cv({ id: 1, filename: "old.pdf", isActive: false, contentPreview: undefined })
    ]);
    getActiveCv.mockResolvedValue(null);
    renderWithProviders(<CvManager />);
    await waitFor(() => expect(screen.getByText("old.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Delete"));
    expect(screen.getByText("Yes")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Yes"));
    await waitFor(() => expect(deleteCv).toHaveBeenCalledWith(1));
  });
});