import {
  downloadFile,
  findFileInFolder,
  getFileMeta,
  uploadSnapshot,
  DriveNotFoundError,
  type DriveFile,
} from "@/lib/drive";
import { getAllExpenses, replaceAllExpenses, type DriveLink } from "@/lib/db";
import type { Expense } from "@/lib/expenses";

export const SNAPSHOT_NAME = "expenses.json";
const SCHEMA = "expense-tracker/v1";

export type Snapshot = {
  schema: typeof SCHEMA;
  version: 1;
  /** Writer's wall clock. Only used to break a genuine two-sided conflict. */
  updatedAt: number;
  expenses: Expense[];
};

export type ParseResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; reason: string };

export function serializeSnapshot(expenses: Expense[], updatedAt: number) {
  const snapshot: Snapshot = { schema: SCHEMA, version: 1, updatedAt, expenses };
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Strict parse. A malformed or newer-version file is rejected rather than
 * coerced — silently dropping fields we don't understand and writing the
 * result back would destroy data written by a newer client.
 */
export function parseSnapshot(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "That file is not in the expected format." };
  }

  const candidate = raw as Partial<Snapshot>;
  if (candidate.schema !== SCHEMA) {
    return { ok: false, reason: "That file was not written by this app." };
  }
  if (candidate.version !== 1) {
    return { ok: false, reason: "That file was written by a newer version of this app." };
  }
  if (!Array.isArray(candidate.expenses)) {
    return { ok: false, reason: "That file has no expense list." };
  }

  const expenses: Expense[] = [];
  for (const item of candidate.expenses) {
    if (
      item &&
      typeof item.id === "string" &&
      typeof item.date === "string" &&
      typeof item.amount === "number" &&
      typeof item.category === "string"
    ) {
      expenses.push({
        id: item.id,
        date: item.date,
        amount: item.amount,
        category: item.category,
        note: typeof item.note === "string" ? item.note : undefined,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
      });
    }
  }

  return {
    ok: true,
    snapshot: {
      schema: SCHEMA,
      version: 1,
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
      expenses,
    },
  };
}

export type SyncAction =
  | { kind: "noop" }
  | { kind: "create" }
  | { kind: "push" }
  | { kind: "pull" }
  | { kind: "conflict"; winner: "local" | "remote" }
  | { kind: "blocked"; reason: string };

/**
 * Pure last-write-wins decision.
 *
 * "Did anything change?" is answered with exact counters — a local revision
 * number and Drive's monotonic `version` — never with wall clocks. Timestamps
 * only break a true both-sides-changed tie, which is the one case where nothing
 * better exists.
 */
export function decideSync(input: {
  fileId: string | null;
  remote: { version?: string; updatedAt: number } | null;
  syncedRemoteVersion: string | null;
  localRevision: number;
  syncedRevision: number;
  localCount: number;
  localMaxUpdatedAt: number;
}): SyncAction {
  const { fileId, remote, syncedRemoteVersion, localRevision, syncedRevision } = input;

  if (!fileId || !remote) return { kind: "create" };

  const localChanged = localRevision !== syncedRevision;
  const remoteChanged = (remote.version ?? null) !== syncedRemoteVersion;

  // Guard: an emptied local store is indistinguishable from an evicted one
  // (Safari clears IndexedDB after ~7 days idle). Never let that erase Drive.
  if (input.localCount === 0 && syncedRevision === 0 && remoteChanged) {
    return { kind: "pull" };
  }

  if (!localChanged && !remoteChanged) return { kind: "noop" };
  if (localChanged && !remoteChanged) return { kind: "push" };
  if (!localChanged && remoteChanged) return { kind: "pull" };

  // Both sides moved. If local is empty, require an explicit choice rather than
  // silently deleting everything on the other device.
  if (input.localCount === 0) {
    return { kind: "blocked", reason: "This device has no expenses but Drive does." };
  }
  return {
    kind: "conflict",
    winner: input.localMaxUpdatedAt >= remote.updatedAt ? "local" : "remote",
  };
}

export type SyncOutcome = {
  link: DriveLink;
  action: SyncAction["kind"];
  /** Set when a conflict backup was written to Drive. */
  backupName?: string;
  /** Set when the sync could not proceed and needs the user to decide. */
  blocked?: string;
};

async function readRemote(accessToken: string, link: DriveLink) {
  if (link.fileId) {
    try {
      const meta = await getFileMeta({ accessToken, fileId: link.fileId });
      if (!meta.trashed) return meta;
    } catch (error) {
      if (!(error instanceof DriveNotFoundError)) throw error;
    }
  }
  // No id, or the id no longer resolves — fall back to finding it by name.
  return findFileInFolder({ accessToken, folderId: link.folderId, name: SNAPSHOT_NAME });
}

async function remoteSnapshot(accessToken: string, file: DriveFile) {
  const text = await downloadFile({ accessToken, fileId: file.id });
  const parsed = parseSnapshot(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.snapshot;
}

/** Preserves the losing side of a conflict so nothing is unrecoverable. */
async function backup(accessToken: string, folderId: string, content: string) {
  const name = `expenses.conflict-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await uploadSnapshot({ accessToken, folderId, name, content });
  return name;
}

export async function runSync({
  accessToken,
  link,
  localRevision,
}: {
  accessToken: string;
  link: DriveLink;
  localRevision: number;
}): Promise<SyncOutcome> {
  const local = await getAllExpenses();
  const localMaxUpdatedAt = local.reduce((max, item) => Math.max(max, item.updatedAt), 0);

  const remoteFile = await readRemote(accessToken, link);
  const remoteHead = remoteFile
    ? { version: remoteFile.version, updatedAt: 0 }
    : null;

  // Only download when the version counter says something actually moved.
  let remoteData: Snapshot | null = null;
  const versionMoved = (remoteFile?.version ?? null) !== link.remoteVersion;
  if (remoteFile && versionMoved) {
    remoteData = await remoteSnapshot(accessToken, remoteFile);
    if (remoteHead) remoteHead.updatedAt = remoteData.updatedAt;
  }

  const action = decideSync({
    fileId: link.fileId,
    remote: remoteFile ? remoteHead : null,
    syncedRemoteVersion: link.remoteVersion,
    localRevision,
    syncedRevision: link.syncedRevision,
    localCount: local.length,
    localMaxUpdatedAt,
  });

  const now = Date.now();
  const synced = (file: DriveFile): DriveLink => ({
    ...link,
    fileId: file.id,
    remoteVersion: file.version ?? null,
    syncedRevision: localRevision,
    lastSyncedAt: now,
  });

  switch (action.kind) {
    case "noop":
      return { link: { ...link, lastSyncedAt: now }, action: "noop" };

    case "create":
    case "push": {
      const file = await uploadSnapshot({
        accessToken,
        fileId: remoteFile?.id,
        folderId: link.folderId,
        name: SNAPSHOT_NAME,
        content: serializeSnapshot(local, now),
      });
      return { link: synced(file), action: action.kind };
    }

    case "pull": {
      const data = remoteData ?? (await remoteSnapshot(accessToken, remoteFile!));
      await replaceAllExpenses(data.expenses);
      return { link: synced(remoteFile!), action: "pull" };
    }

    case "conflict": {
      if (action.winner === "remote") {
        const backupName = await backup(
          accessToken,
          link.folderId,
          serializeSnapshot(local, localMaxUpdatedAt),
        );
        const data = remoteData ?? (await remoteSnapshot(accessToken, remoteFile!));
        await replaceAllExpenses(data.expenses);
        return { link: synced(remoteFile!), action: "pull", backupName };
      }

      const backupName = await backup(
        accessToken,
        link.folderId,
        serializeSnapshot(remoteData?.expenses ?? [], remoteData?.updatedAt ?? 0),
      );
      const file = await uploadSnapshot({
        accessToken,
        fileId: remoteFile!.id,
        folderId: link.folderId,
        name: SNAPSHOT_NAME,
        content: serializeSnapshot(local, now),
      });
      return { link: synced(file), action: "push", backupName };
    }

    case "blocked":
      return { link, action: "noop", blocked: action.reason };
  }
}
