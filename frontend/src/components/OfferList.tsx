import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Offer } from "../api/offers";
import { patchOffer } from "../api/offers";
import OfferRow from "./OfferRow";

interface Props {
  offers: Offer[];
}

export default function OfferList({ offers }: Props) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: (id: number) => patchOffer(id, { archived: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offers"] })
  });

  if (offers.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-12 text-center text-sm text-[var(--color-quiet)]">
        No offers.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      {offers.map((o) => (
        <OfferRow key={o.id} offer={o} onArchive={(id) => archive.mutate(id)} />
      ))}
    </div>
  );
}