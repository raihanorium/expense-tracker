"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { TokenClient, TokenResponse } from "@/types/gis";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  DRIVE_SCOPE,
].join(" ");

/**
 * Survives page reloads within the tab. There are no refresh tokens in the
 * browser OAuth flow, so without this every reload would need a fresh popup.
 * sessionStorage (not localStorage) so it dies with the tab.
 */
const STORAGE_KEY = "expense-tracker.token";

type StoredToken = { accessToken: string; expiresAt: number };

type User = { sub?: string; name?: string; email?: string; picture?: string };

type AuthContextValue = {
  status: "signed-out" | "signed-in";
  accessToken: string | null;
  user: User | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  /** Called when Drive rejects the token mid-session. */
  invalidate: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useGoogleAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useGoogleAuth must be used inside GoogleAuthProvider");
  return context;
}

let gisLoader: Promise<void> | null = null;

/**
 * Injects the Google Identity Services script, once, on demand.
 *
 * Deliberately not called at startup: the app is offline-first and most
 * sessions never touch Google at all, so it would be a pointless network
 * request that fails offline.
 */
function loadGis() {
  if (gisLoader) return gisLoader;
  gisLoader = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not reach Google to sign in."));
    document.head.appendChild(script);
  }).catch((error) => {
    gisLoader = null; // Allow a retry rather than caching the failure.
    throw error;
  });
  return gisLoader;
}

function readStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    // Treat anything within a minute of expiry as already gone.
    if (parsed.expiresAt < Date.now() + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchUser(accessToken: string): Promise<User | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as User;
  } catch {
    return null;
  }
}

export default function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("signed-out");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenClient = useRef<TokenClient | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSession = useCallback(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    sessionStorage.removeItem(STORAGE_KEY);
    setAccessToken(null);
    setUser(null);
    setStatus("signed-out");
  }, []);

  const applyToken = useCallback(
    async (token: string, expiresAt: number) => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: token, expiresAt } satisfies StoredToken),
      );
      setAccessToken(token);
      setStatus("signed-in");
      setError(null);

      // Drop the session the moment the token lapses rather than waiting for a
      // request to fail.
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      expiryTimer.current = setTimeout(clearSession, Math.max(0, expiresAt - Date.now()));

      if (navigator.onLine) setUser(await fetchUser(token));
    },
    [clearSession],
  );

  // Restoring a token needs no network and no Google script — just storage.
  useEffect(() => {
    const stored = readStoredToken();
    if (stored) void applyToken(stored.accessToken, stored.expiresAt);
    return () => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
    };
  }, [applyToken]);

  const signIn = useCallback(() => {
    setError(null);

    if (!CLIENT_ID) {
      setError("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set for this build.");
      return;
    }
    if (tokenClient.current) {
      tokenClient.current.requestAccessToken();
      return;
    }

    loadGis()
      .then(() => {
        if (!window.google) throw new Error("Google sign-in is unavailable.");

        tokenClient.current = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          // Empty prompt lets Google skip the consent screen once granted.
          prompt: "",
          callback: (response: TokenResponse) => {
            if (response.error) {
              setError(response.error_description ?? "Google sign-in was cancelled.");
              return;
            }
            if (!window.google?.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
              setError("Drive access is required to sync.");
              return;
            }
            void applyToken(response.access_token, Date.now() + response.expires_in * 1000);
          },
          error_callback: (err) => setError(err.message ?? "Google sign-in failed."),
        });

        tokenClient.current.requestAccessToken();
      })
      .catch((err: Error) => setError(err.message));
  }, [applyToken]);

  const invalidate = useCallback(() => {
    clearSession();
    setError("Your Google session expired. Sign in again to resume syncing.");
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{ status, accessToken, user, error, signIn, signOut: clearSession, invalidate }}
    >
      {children}
    </AuthContext.Provider>
  );
}
