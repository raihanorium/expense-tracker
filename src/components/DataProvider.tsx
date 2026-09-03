"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useGoogleAuth } from "@/components/GoogleAuthProvider";
import {
  deleteExpense as dbDelete,
  getAllExpenses,
  getSettings,
  putExpense,
  replaceAllExpenses,
  saveSettings,
  DEFAULT_SETTINGS,
  type DriveLink,
  type Settings,
} from "@/lib/db";
import { DriveAuthError, DriveQuotaError, DriveRateLimitError } from "@/lib/drive";
import { downloadBackup, readBackupFile } from "@/lib/backup";
import { pickFolder } from "@/lib/picker";
import { runSync } from "@/lib/sync";
import { newId, sortExpenses, type Expense } from "@/lib/expenses";

export type SyncPhase = "idle" | "syncing" | "needs-auth" | "error";

type DataContextValue = {
  ready: boolean;
  expenses: Expense[];
  settings: Settings;
  drive: DriveLink | null;
  phase: SyncPhase;
  online: boolean;
  dirty: boolean;
  message: string | null;
  addExpense: (draft: Omit<Expense, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  editExpense: (id: string, patch: Partial<Expense>) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  exportFile: () => void;
  importFile: (file: File) => Promise<{ ok: boolean; reason?: string; count?: number }>;
  connectDrive: () => Promise<void>;
  disconnectDrive: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used inside DataProvider");
  return context;
}

const DEBOUNCE_MS = 3_000;

export default function DataProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user, signIn, invalidate } = useGoogleAuth();

  const [ready, setReady] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // Starts true so the first client paint matches the prerendered HTML.
  const [online, setOnline] = useState(true);
  // Set when the user asked to connect Drive but had to sign in first.
  const [pendingConnect, setPendingConnect] = useState(false);

  // Refs so the debounced sync always sees current values without re-arming.
  const settingsRef = useRef<Settings>(settings);
  const tokenRef = useRef<string | null>(accessToken);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  settingsRef.current = settings;
  tokenRef.current = accessToken;

  const drive = settings.drive;
  const dirty = drive ? settings.localRevision !== drive.syncedRevision : false;

  // Boot entirely from local storage — no account, no network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rows, stored] = await Promise.all([getAllExpenses(), getSettings()]);
      if (cancelled) return;
      setExpenses(sortExpenses(rows));
      setSettings(stored);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Settings) => {
    setSettings(next);
    settingsRef.current = next;
    await saveSettings(next);
  }, []);

  const syncNow = useCallback(async () => {
    const current = settingsRef.current;
    const link = current.drive;
    const token = tokenRef.current;

    // Drive is optional: with no link there is simply nothing to sync.
    if (!link) return;
    if (!token) {
      setPhase("needs-auth");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (inFlight.current) return;

    inFlight.current = true;
    setPhase("syncing");
    setMessage(null);

    try {
      const outcome = await runSync({
        accessToken: token,
        link,
        localRevision: current.localRevision,
      });
      await persist({ ...settingsRef.current, drive: outcome.link });

      if (outcome.action === "pull") setExpenses(sortExpenses(await getAllExpenses()));

      if (outcome.blocked) {
        setPhase("error");
        setMessage(outcome.blocked);
      } else {
        setPhase("idle");
        if (outcome.backupName) {
          setMessage(`Resolved a conflict. The other version was saved as ${outcome.backupName}.`);
        }
      }
    } catch (error) {
      if (error instanceof DriveAuthError) {
        setPhase("needs-auth");
        invalidate();
      } else if (error instanceof DriveRateLimitError || error instanceof DriveQuotaError) {
        setPhase("error");
        setMessage(error.message);
      } else if (typeof navigator !== "undefined" && !navigator.onLine) {
        setPhase("idle");
      } else {
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Sync failed.");
      }
    } finally {
      inFlight.current = false;
    }
  }, [invalidate, persist]);

  /** Records a local change, and schedules a sync only if Drive is connected. */
  const touch = useCallback(async () => {
    const current = settingsRef.current;
    await persist({ ...current, localRevision: current.localRevision + 1 });
    if (!current.drive) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  }, [persist, syncNow]);

  const addExpense = useCallback<DataContextValue["addExpense"]>(
    async (draft) => {
      const now = Date.now();
      const expense: Expense = { ...draft, id: newId(), createdAt: now, updatedAt: now };
      await putExpense(expense);
      setExpenses((current) => sortExpenses([...current, expense]));
      await touch();
    },
    [touch],
  );

  const editExpense = useCallback<DataContextValue["editExpense"]>(
    async (id, patch) => {
      const existing = expenses.find((item) => item.id === id);
      if (!existing) return;
      const updated: Expense = { ...existing, ...patch, id, updatedAt: Date.now() };
      await putExpense(updated);
      setExpenses((current) => sortExpenses(current.map((item) => (item.id === id ? updated : item))));
      await touch();
    },
    [expenses, touch],
  );

  const removeExpense = useCallback<DataContextValue["removeExpense"]>(
    async (id) => {
      await dbDelete(id);
      setExpenses((current) => current.filter((item) => item.id !== id));
      await touch();
    },
    [touch],
  );

  const exportFile = useCallback(() => downloadBackup(expenses), [expenses]);

  const importFile = useCallback<DataContextValue["importFile"]>(
    async (file) => {
      const result = await readBackupFile(file);
      if (!result.ok) return { ok: false, reason: result.reason };

      await replaceAllExpenses(result.snapshot.expenses);
      setExpenses(sortExpenses(result.snapshot.expenses));
      await touch();
      return { ok: true, count: result.snapshot.expenses.length };
    },
    [touch],
  );

  /**
   * The only place sign-in happens. Drive backup is the sole reason the app
   * ever needs a Google account.
   */
  const connectDrive = useCallback(async () => {
    setMessage(null);
    if (!tokenRef.current) {
      // Sign-in is a popup; resume automatically once the token lands.
      setPendingConnect(true);
      signIn();
      return;
    }
    try {
      const picked = await pickFolder({ accessToken: tokenRef.current });
      if (!picked) return;

      const current = settingsRef.current;
      await persist({
        ...current,
        drive: {
          accountId: user?.sub ?? user?.email ?? "unknown",
          accountLabel: user?.email ?? user?.name ?? "your Google account",
          folderId: picked.id,
          folderName: picked.name,
          fileId: null,
          // Never-synced sentinel, so the first run always writes the file.
          syncedRevision: -1,
          remoteVersion: null,
          lastSyncedAt: null,
        },
      });
      await syncNow();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Could not open the folder picker.");
    }
  }, [persist, signIn, syncNow, user]);

  const disconnectDrive = useCallback(async () => {
    await persist({ ...settingsRef.current, drive: null });
    setPhase("idle");
    setMessage(null);
  }, [persist]);

  // Resume the interrupted connect flow once sign-in completes.
  useEffect(() => {
    if (!pendingConnect || !accessToken) return;
    setPendingConnect(false);
    void connectDrive();
  }, [pendingConnect, accessToken, connectDrive]);

  // Sync once on startup when Drive is already connected.
  useEffect(() => {
    if (!ready || !settings.drive) return;
    void syncNow();
    // Keyed on readiness and folder identity only — reacting to every settings
    // change would make a successful sync retrigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.drive?.folderId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    // Reconnecting is the only thing that resumes sync; there is no polling.
    const onOnline = () => {
      update();
      void syncNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", update);
    };
  }, [syncNow]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <DataContext.Provider
      value={{
        ready,
        expenses,
        settings,
        drive,
        phase,
        online,
        dirty,
        message,
        addExpense,
        editExpense,
        removeExpense,
        exportFile,
        importFile,
        connectDrive,
        disconnectDrive,
        syncNow,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
