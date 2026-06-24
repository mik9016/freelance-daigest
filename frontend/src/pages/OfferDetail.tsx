import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { getOffer, patchOffer } from "../api/offers";
import ChatWindow from "../components/ChatWindow";
import NotesPanel from "../components/NotesPanel";

export default function OfferDetail() {
  const { id } = useParams();
  const offerId = Number(id);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOffer(offerId),
    enabled: Number.isFinite(offerId)
  });

  const toggleSent = useMutation({
    mutationFn: (next: boolean) => patchOffer(offerId, { sent: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offer", offerId] })
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[var(--color-quiet)]">
        Loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-sm">
        <p className="text-red-600">Offer not found.</p>
        <Link to="/" className="btn-ghost">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[var(--color-line)] px-8 py-4">
        <Link to="/" className="btn-ghost text-xs">
          <ArrowLeft size={14} className="mr-1" /> Back
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-8 py-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="card p-6">
            <h1 className="text-xl font-semibold tracking-tight text-black">{data.title}</h1>
            <p className="mt-1 text-sm text-[var(--color-quiet)]">
              {[data.company, data.location, data.remotePct === 100 ? "100% Remote" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {data.contractType && <span className="badge-quiet">{data.contractType}</span>}
              {data.duration && <span className="badge-quiet">{data.duration}</span>}
              {data.startDate && <span className="badge-quiet">Start: {data.startDate}</span>}
              {data.searchTerms.map((t) => (
                <span key={t} className="badge-quiet">#{t}</span>
              ))}
            </div>
            <a
              href={data.detailUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-block text-xs underline text-[var(--color-quiet)] hover:text-black"
            >
              Open original on freelancermap ↗
            </a>
          </div>
          <div className="card p-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-quiet)]">
              Description
            </h2>
            <div className="whitespace-pre-wrap text-sm text-black">{data.descriptionText}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-quiet)]">
                Sent status
              </p>
              <p className="mt-1 text-sm text-black">
                {data.sent ? `Sent ${new Date(data.sentAt!).toLocaleString("de-DE")}` : "Not sent yet"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleSent.mutate(!data.sent)}
              className={data.sent ? "btn-ghost" : "btn-primary"}
              disabled={toggleSent.isPending}
            >
              <Check size={14} className="mr-1" />
              {data.sent ? "Unmark" : "Mark as sent"}
            </button>
          </div>
          <NotesPanel offerId={offerId} initialNotes={data.notes} />
          <ChatWindow offerId={offerId} hasExistingThread={data.hasMessage} />
        </div>
      </main>
    </div>
  );
}