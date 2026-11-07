"use client";

import * as React from "react";
import { toast } from "sonner";

/** Registra o service worker (PWA instalável). */
export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol === "http:" && window.location.hostname !== "localhost") return;
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => toast.error("Não foi possível ativar o modo offline."));
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
