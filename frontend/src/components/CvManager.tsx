import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Check, X } from "lucide-react";
import {
  activateCv,
  deleteCv,
  getActiveCv,
  listCvHistory,
  MAX_UPLOAD_BYTES,
  uploadCv,
  type CvMeta
} from "../api/cv";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString("de-DE"); } catch { return iso; }
}

export default function CvManager({ onClose }: { onClose?: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const active = useQuery({ queryKey: ["cv", "active"], queryFn: getActiveCv });
  const history = useQuery({ queryKey: ["cv", "history"], queryFn: listCvHistory });

  const upload = useMutation({
    mutationFn: (file: File) => uploadCv(file),
    onSuccess: () => {
      setUploadErr(null);
      qc.invalidateQueries({ queryKey: ["cv"] });
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number }).status;
      const body = (err as { body?: { error?: string } }).body;
      if (status === 413 || body?.error === "file_too_large") setUploadErr("File too large (max 5 MB).");
      else if (body?.error === "invalid_pdf") setUploadErr("Not a valid PDF.");
      else if (body?.error === "empty_pdf") setUploadErr("PDF has no extractable text.");
      else if (body?.error === "pdf_password") setUploadErr("PDF is password-protected.");
      else setUploadErr("Upload failed. Try again.");
    }
  });

  const activate = useMutation({
    mutationFn: (id: number) => activateCv(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv"] })
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteCv(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv"] })
  });

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setUploadErr("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadErr("File too large (max 5 MB).");
      return;
    }
    setUploadErr(null);
    upload.mutate(file);
  };

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-quiet)]">CV</h2>
        {onClose && (
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-white p-4">
        {active.isLoading ? (
          <p className="text-xs text-[var(--color-quiet)]">Loading…</p>
        ) : active.data ? (
          <div>
            <p className="text-sm font-medium text-black">{active.data.filename}</p>
            <p className="mt-0.5 text-xs text-[var(--color-quiet)]">
              {formatSize(active.data.size)} · {formatDate(active.data.createdAt)}
            </p>
            <span className="badge-ink mt-2">Active</span>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-quiet)]">No CV uploaded yet.</p>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          onClick={onPickFile}
          disabled={upload.isPending}
          className="btn-primary text-xs"
        >
          <Upload size={14} className="mr-1" />
          {upload.isPending ? "Uploading…" : "Upload PDF"}
        </button>
        {uploadErr && <span className="text-xs text-red-600">{uploadErr}</span>}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-quiet)]">
          History
        </p>
        {history.isLoading ? (
          <p className="text-xs text-[var(--color-quiet)]">Loading…</p>
        ) : !history.data || history.data.length === 0 ? (
          <p className="text-xs text-[var(--color-quiet)]">No CVs uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {history.data.map((row: CvMeta) => (
              <li key={row.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-black">{row.filename}</p>
                  <p className="text-xs text-[var(--color-quiet)]">
                    {formatSize(row.size)} · {formatDate(row.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {row.isActive ? (
                    <span className="badge-ink">Active</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activate.mutate(row.id)}
                      disabled={activate.isPending}
                      className="btn-ghost text-xs"
                      title="Set as active"
                    >
                      <Check size={14} className="mr-1" /> Activate
                    </button>
                  )}
                  {confirmId === row.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { remove.mutate(row.id); setConfirmId(null); }}
                        className="btn-ghost text-xs text-red-600"
                      >Yes</button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="btn-ghost text-xs"
                      >No</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(row.id)}
                      className="btn-ghost text-xs text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}