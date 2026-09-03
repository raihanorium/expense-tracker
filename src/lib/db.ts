import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Expense } from "@/lib/expenses";

const DB_NAME = "expense-tracker";
const DB_VERSION = 1;

/** Set only once the user opts into Google Drive backup. */
export type DriveLink = {
  /** Google account the folder belongs to, so we can spot a mismatch later. */
  accountId: string;
  accountLabel: string;
  folderId: string;
  folderName: string;
  fileId: string | null;
  /** Value of localRevision at the last successful sync. */
  syncedRevision: number;
  /** Drive's `version` counter at the last successful sync. */
  remoteVersion: string | null;
  lastSyncedAt: number | null;
};

export type Settings = {
  /** Bumped on every local mutation. Meaningful with or without Drive. */
  localRevision: number;
  drive: DriveLink | null;
};

export const DEFAULT_SETTINGS: Settings = { localRevision: 0, drive: null };

interface Schema extends DBSchema {
  expenses: {
    key: string;
    value: Expense;
    indexes: { "by-date": string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      // Guards are append-only: never edit or reorder a shipped block.
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const expenses = database.createObjectStore("expenses", { keyPath: "id" });
          expenses.createIndex("by-date", "date");
          database.createObjectStore("meta");
        }
      },
      blocking() {
        // Another tab is upgrading; release our handle so it isn't deadlocked.
        dbPromise?.then((open) => open.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

export async function getAllExpenses(): Promise<Expense[]> {
  return (await db()).getAll("expenses");
}

export async function putExpense(expense: Expense) {
  await (await db()).put("expenses", expense);
}

export async function deleteExpense(id: string) {
  await (await db()).delete("expenses", id);
}

/**
 * Wholesale replace, used by a Drive pull or a file import. One transaction, so
 * a failure can't leave the store cleared but unfilled.
 */
export async function replaceAllExpenses(expenses: Expense[]) {
  const database = await db();
  const tx = database.transaction("expenses", "readwrite");
  await tx.store.clear();
  await Promise.all(expenses.map((expense) => tx.store.put(expense)));
  await tx.done;
}

const SETTINGS_KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const value = await (await db()).get("meta", SETTINGS_KEY);
  return (value as Settings | undefined) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings) {
  await (await db()).put("meta", settings, SETTINGS_KEY);
}
