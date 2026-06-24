import { useEffect } from "react";
import { handleSilentRenewCallback } from "../auth/oidc";

export default function SilentRenew() {
  useEffect(() => {
    void handleSilentRenewCallback();
  }, []);
  return null;
}