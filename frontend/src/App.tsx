import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { initOidc, isAuthenticated } from "./auth/oidc";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import OfferDetail from "./pages/OfferDetail";
import Callback from "./pages/Callback";
import SilentRenew from "./pages/SilentRenew";

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    initOidc()
      .then(() => setAuthed(isAuthenticated()))
      .catch(() => setAuthed(false))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-black">
        <span className="text-sm text-[var(--color-quiet)]">Loading…</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/silent-renew" element={<SilentRenew />} />
      <Route
        path="/*"
        element={
          authed || location.pathname === "/login" ? (
            <AuthedRoutes />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function AuthedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/offers/:id" element={<OfferDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}