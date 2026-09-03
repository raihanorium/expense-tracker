"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/components/DataProvider";
import { useGoogleAuth } from "@/components/GoogleAuthProvider";
import { pickerConfigError } from "@/lib/picker";

const DOT: Record<string, string> = {
  idle: "bg-emerald-500",
  syncing: "bg-amber-500",
  offline: "bg-zinc-400",
  "needs-auth": "bg-amber-500",
  error: "bg-red-500",
};

const buttonClass =
  "rounded-full border border-black/[.12] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.16] dark:hover:bg-white/[.06]";

function relativeTime(timestamp: number | null) {
  if (!timestamp) return "not yet";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return format.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86_400), "day");
}

export default function BackupPanel() {
  const {
    expenses,
    drive,
    phase,
    online,
    dirty,
    message,
    exportFile,
    importFile,
    connectDrive,
    disconnectDrive,
    syncNow,
  } = useData();
  const { signIn, error: authError } = useGoogleAuth();

  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configError = pickerConfigError();

  // Keep "2 minutes ago" honest. Display only — never triggers a sync.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const effectivePhase = online ? phase : "offline";

  const syncLabel = (() => {
    switch (effectivePhase) {
      case "syncing":
        return "Syncing…";
      case "offline":
        return dirty ? "Offline — will sync when you reconnect" : "Offline";
      case "needs-auth":
        return "Sign in again to resume syncing";
      case "error":
        return "Sync failed";
      default:
        return dirty ? "Unsaved changes" : `Synced ${relativeTime(drive?.lastSyncedAt ?? null)}`;
    }
  })();

  return (
    <section className="flex flex-col divide-y divide-black/[.06] rounded-xl border border-black/[.08] text-sm dark:divide-white/[.08] dark:border-white/[.12]">
      {/* Local file — always available, no account, works offline. */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="font-medium">Backup to a file</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Save a copy on this device, or restore one.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              exportFile();
              setNotice("Backup file saved.");
            }}
            disabled={expenses.length === 0}
            className={buttonClass}
          >
            Export
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;

              if (
                expenses.length > 0 &&
                !window.confirm(
                  `Importing replaces all ${expenses.length} expenses on this device. Continue?`,
                )
              ) {
                return;
              }

              const result = await importFile(file);
              setNotice(
                result.ok ? `Imported ${result.count} expenses.` : (result.reason ?? "Import failed."),
              );
            }}
          />
        </div>
      </div>

      {/* Google Drive — entirely optional, and the only thing needing sign-in. */}
      <div className="flex flex-col gap-2 px-4 py-3">
        {!drive ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Sync with Google Drive</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Optional. Keeps devices in step automatically. Asks you to sign in.
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !online || Boolean(configError)}
              onClick={async () => {
                setBusy(true);
                try {
                  await connectDrive();
                } finally {
                  setBusy(false);
                }
              }}
              className={buttonClass}
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${DOT[effectivePhase] ?? "bg-zinc-400"}`}
                />
                <span>{syncLabel}</span>
              </span>

              <span className="flex items-center gap-2">
                {effectivePhase === "needs-auth" ? (
                  <button type="button" onClick={signIn} className={buttonClass}>
                    Sign in
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void syncNow()}
                    disabled={effectivePhase === "syncing" || !online}
                    className={buttonClass}
                  >
                    Sync now
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void connectDrive()}
                  disabled={!online}
                  className={buttonClass}
                >
                  Change folder
                </button>
                <button
                  type="button"
                  onClick={() => void disconnectDrive()}
                  className="rounded-full px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Disconnect
                </button>
              </span>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {drive.folderName} / expenses.json · {drive.accountLabel}
            </p>
          </>
        )}

        {(configError ?? authError) && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {configError ?? authError}
          </p>
        )}
        {message && (
          <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
            {message}
          </p>
        )}
      </div>

      {notice && (
        <p className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
