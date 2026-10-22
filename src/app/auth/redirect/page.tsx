"use client";

import { useAuthCallback } from "@tidecloak/nextjs";
import { useEffect, useState } from "react";
import { SIMULATE } from "@/lib/simulate";

// Separated so useAuthCallback only runs after hydration (avoids SSR window error).
function RedirectHandler() {
  const { isProcessing, isSuccess, error } = useAuthCallback({
    onSuccess: (returnUrl) => {
      window.location.assign(returnUrl || "/");
    },
    onError: () => {
      window.location.assign("/");
    },
    onMissingVerifierRedirectTo: "/",
  });

  useEffect(() => {
    // If this page is loaded without callback params (direct navigation),
    // redirect to home.
    const params = new URLSearchParams(window.location.search);
    if (!params.has("code") && !params.has("error")) {
      window.location.assign("/");
    }
  }, []);

  if (error) {
    return <p>Authentication failed: {error.message}</p>;
  }

  if (isProcessing || !isSuccess) {
    return <p>Completing login...</p>;
  }

  return <p>Redirecting...</p>;
}

export default function AuthRedirectPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Simulation mode has no Tide callback; useAuthCallback needs the real provider.
  useEffect(() => { if (SIMULATE) location.assign("/"); }, []);
  if (SIMULATE) return <p>Redirecting...</p>;
  if (!mounted) return <p>Loading...</p>;
  return <RedirectHandler />;
}
