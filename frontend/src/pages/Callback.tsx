import { useEffect, useRef, useState } from "react";
import { handleSigninCallback } from "../auth/oidc";

export default function Callback() {
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    handleSigninCallback().catch((e: unknown) => setErr((e as Error).message));
  }, []);

  if (err) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white">
        <p className="text-sm text-red-600">Sign-in failed: {err}</p>
        <a href="/login" className="btn-primary">
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <span className="text-sm text-[var(--color-quiet)]">Signing in…</span>
    </div>
  );
}