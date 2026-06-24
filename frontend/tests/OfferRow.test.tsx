import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OfferRow from "../src/components/OfferRow";
import type { Offer } from "../src/api/offers";

function baseOffer(over: Partial<Offer> = {}): Offer {
  return {
    id: 1,
    externalId: "x",
    title: "Some role",
    company: "SomeCo",
    location: "Berlin",
    remotePct: 100,
    contractType: null,
    duration: null,
    startDate: null,
    postedAt: new Date().toISOString(),
    detailUrl: "https://example.com/x",
    descriptionText: "",
    searchTerms: ["react"],
    archived: false,
    sent: false,
    sentAt: null,
    notes: "",
    hasMessage: false,
    hasNotes: false,
    openwebuiChatId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over
  };
}

describe("OfferRow", () => {
  it("renders title, company, location", () => {
    render(
      <MemoryRouter>
        <OfferRow offer={baseOffer({ title: "Senior React Dev", company: "Acme", location: "Berlin" })} onArchive={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Senior React Dev")).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/Berlin/)).toBeInTheDocument();
  });

  it("shows Sent badge when sent", () => {
    render(
      <MemoryRouter>
        <OfferRow offer={baseOffer({ sent: true })} onArchive={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("hides Sent badge when not sent", () => {
    render(
      <MemoryRouter>
        <OfferRow offer={baseOffer({ sent: false })} onArchive={() => {}} />
      </MemoryRouter>
    );
    expect(screen.queryByText("Sent")).toBeNull();
  });

  it("shows Draft badge when hasMessage", () => {
    render(
      <MemoryRouter>
        <OfferRow offer={baseOffer({ hasMessage: true })} onArchive={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows Notes badge when hasNotes", () => {
    render(
      <MemoryRouter>
        <OfferRow offer={baseOffer({ hasNotes: true })} onArchive={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("archive button calls onArchive and stops propagation", () => {
    const onArchive = vi.fn();
    render(
      <MemoryRouter>
        <OfferRow offer={baseOffer({ id: 42 })} onArchive={onArchive} />
      </MemoryRouter>
    );
    const archiveBtn = screen.getByLabelText("Archive");
    fireEvent.click(archiveBtn);
    expect(onArchive).toHaveBeenCalledWith(42);
  });
});