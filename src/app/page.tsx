"use client";

import DriveBrowser from "@/components/DriveBrowser";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { useGoogleAuth } from "@/components/GoogleAuthProvider";

export default function Home() {
  const { status, error } = useGoogleAuth();

  if (status === "signed-in") {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
        <DriveBrowser />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Drive Browser</h1>
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
          Sign in with Google to browse your Drive files. Read-only access — nothing is ever
          modified.
        </p>
      </div>

      <GoogleSignInButton />

      {error && (
        <p className="max-w-sm text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
