import { useState } from "react";
import { login } from "../auth/oidc";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await login();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 bg-white">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black">freelance daigest</h1>
        <p className="mt-2 text-sm text-[var(--color-quiet)]">Sign in to manage your job applications</p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="btn-primary min-w-[220px] disabled:opacity-60"
      >
        {busy ? "Redirecting…" : "Sign in"}
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}