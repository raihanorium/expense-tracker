"use client";

import { useEffect } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Registers the offline app-shell worker. Renders nothing. */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Never in dev: `next dev` rebuilds chunks under changing URLs, so a cached
    // shell quickly references files that no longer exist and the app stops
    // loading. Also unregister any worker left over from a previous dev run,
    // otherwise it keeps serving that stale shell forever.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => undefined);
      return;
    }

    // Scope must match where the app is served from, or navigation requests
    // under the base path won't be intercepted.
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {
      // Offline support is a bonus; never break the app over it.
    });
  }, []);

  return null;
}
