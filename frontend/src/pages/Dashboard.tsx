import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logout } from "../auth/oidc";
import {
  deleteOffer,
  listOffers,
  triggerScrape,
  getScrapeStatus,
  type OfferFilter,
  type SortField,
  type SortOrder,
  type ScrapeProgress
} from "../api/offers";
import OfferList from "../components/OfferList";
import CvManager from "../components/CvManager";

const FILTERS: { value: OfferFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "unsent", label: "Unsent" },
  { value: "sent", label: "Sent" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" }
];

const SORTS: { value: SortField; label: string }[] = [
  { value: "posted_at", label: "Posted" },
  { value: "company", label: "Company" },
  { value: "has_message", label: "Has draft" },
  { value: "has_notes", label: "Has notes" },
  { value: "title", label: "Title" }
];

export default function Dashboard() {
  const [filter, setFilter] = useState<OfferFilter>("active");
  const [sort, setSort] = useState<SortField>("posted_at");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [cvOpen, setCvOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["offers", filter, sort, order],
    queryFn: () => listOffers({ filter, sort, order, limit: 200 })
  });

  const scrape = useMutation({
    mutationFn: () => triggerScrape(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scrape", "status"] })
  });

  const { data: progress } = useQuery<ScrapeProgress, Error, ScrapeProgress>({
    queryKey: ["scrape", "status"],
    queryFn: getScrapeStatus,
    refetchInterval: (q) => (q.state.data?.running ? 1000 : false),
    refetchOnWindowFocus: false
  });
  const p: ScrapeProgress | undefined = progress;

  useEffect(() => {
    if (p && !p.running && p.finishedAt) {
      qc.invalidateQueries({ queryKey: ["offers"] });
    }
  }, [p?.running, p?.finishedAt, qc]);

  const isScraping = Boolean(progress?.running);
  const total = progress?.terms.length ?? 0;
  const termIndex = progress?.currentTerm
    ? progress.terms.indexOf(progress.currentTerm) + 1
    : 0;
  const pct = isScraping && total > 0
    ? Math.min(100, Math.round(((termIndex - 0.5) / total) * 100))
    : progress && !progress.running && progress.finishedAt
      ? 100
      : 0;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[var(--color-line)] px-8 py-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-black">freelance daigest</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrape.mutate()}
              className="btn-ghost"
              disabled={scrape.isPending || isScraping}
            >
              {scrape.isPending || isScraping ? "Scraping…" : "Run scrape"}
            </button>
            <button type="button" onClick={() => setCvOpen(true)} className="btn-ghost">
              CV
            </button>
            <button type="button" onClick={() => logout()} className="btn-ghost">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full border border-[var(--color-line)] bg-white p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === f.value ? "bg-black text-white" : "text-[var(--color-quiet)] hover:bg-neutral-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortField)}
              className="input text-xs"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
              className="btn-ghost text-xs"
            >
              {order === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>

        {isScraping && progress && (
          <div className="mb-6 rounded-2xl border border-[var(--color-line)] bg-white p-4 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-black">
                {progress.currentTerm
                  ? `Scraping "${progress.currentTerm}" (${termIndex}/${total})`
                  : "Processing offers…"}
              </span>
              <span className="text-xs text-[var(--color-quiet)]">
                fetched {progress.fetched} · new {progress.persisted} · updated {progress.updated} · skipped {progress.skipped}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full bg-black transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {!isScraping && progress && progress.finishedAt && (progress.persisted + progress.updated + progress.skipped) > 0 && (
          <div className="mb-6 rounded-2xl border border-[var(--color-line)] bg-white p-4 text-sm">
            <p className="text-black">
              Last scrape done: {progress.persisted} new · {progress.updated} updated · {progress.skipped} skipped · {progress.fetched} fetched
              {progress.errors.length > 0 && <span className="text-red-600"> · {progress.errors.length} errors</span>}
            </p>
          </div>
        )}
        {isLoading && <p className="text-sm text-[var(--color-quiet)]">Loading…</p>}
        {error && (
          <div className="rounded-2xl border border-[var(--color-line)] bg-white p-6 text-sm">
            <p className="text-red-600">Failed to load offers.</p>
            <button type="button" onClick={() => refetch()} className="btn-ghost mt-2 text-xs">
              Retry
            </button>
          </div>
        )}
        {data && <OfferList offers={data} />}
      </main>

      {cvOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 py-10"
          onClick={(e) => { if (e.target === e.currentTarget) setCvOpen(false); }}
        >
          <div className="w-full max-w-lg">
            <CvManager onClose={() => setCvOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}