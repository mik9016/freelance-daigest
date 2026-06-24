import { useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";
import type { Offer } from "../api/offers";
import StatusBadge from "./StatusBadge";

interface Props {
  offer: Offer;
  onArchive: (id: number) => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.round((now - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 30) return `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE");
}

export default function OfferRow({ offer, onArchive }: Props) {
  const navigate = useNavigate();
  const remote = offer.remotePct === 100 ? "100% Remote" : offer.remotePct > 0 ? `${offer.remotePct}% Remote` : null;

  const open = () => navigate(`/offers/${offer.id}`);
  const archive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive(offer.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="flex cursor-pointer items-center justify-between border-b border-[var(--color-line)] px-4 py-4 hover:bg-[var(--color-mute)]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-black">{offer.title}</div>
        <div className="mt-0.5 text-xs text-[var(--color-quiet)]">
          {[offer.company, offer.location, remote].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge show={offer.sent} label="Sent" variant="ink" />
          <StatusBadge show={offer.hasMessage} label="Draft" />
          <StatusBadge show={offer.hasNotes} label="Notes" />
          {offer.postedAt && <span className="badge-quiet">{relativeTime(offer.postedAt)}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={archive}
        className="btn-ghost ml-3 px-2"
        aria-label="Archive"
        title="Archive"
      >
        <Archive size={16} />
      </button>
    </div>
  );
}