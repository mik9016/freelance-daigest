import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchOffer } from "../api/offers";

interface Props {
  offerId: number;
  initialNotes: string;
}

export default function NotesPanel({ offerId, initialNotes }: Props) {
  const [value, setValue] = useState(initialNotes);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const qc = useQueryClient();
  const lastSaved = useRef(initialNotes);

  useEffect(() => {
    setValue(initialNotes);
    lastSaved.current = initialNotes;
  }, [initialNotes, offerId]);

  const save = useMutation({
    mutationFn: (next: string) => patchOffer(offerId, { notes: next }),
    onSuccess: () => {
      lastSaved.current = value;
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ["offer", offerId] });
    }
  });

  const onBlur = () => {
    const trimmed = value.trim();
    if (trimmed === lastSaved.current.trim()) return;
    save.mutate(trimmed);
  };

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--color-quiet)]">
          Notes
        </label>
        <span className="text-xs text-[var(--color-quiet)]">
          {save.isPending ? "Saving…" : savedAt ? "Saved" : ""}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        rows={5}
        className="input w-full resize-y text-sm"
        placeholder="Your private notes about this offer…"
      />
      {save.isError && (
        <p className="mt-2 text-xs text-red-600">Save failed. Try again.</p>
      )}
    </div>
  );
}