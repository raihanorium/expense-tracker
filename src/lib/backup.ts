import { parseSnapshot, serializeSnapshot, type Snapshot } from "@/lib/sync";
import { todayIso, type Expense } from "@/lib/expenses";

/**
 * Saves a snapshot to the user's device. Uses the same format as the Drive
 * file, so a local export can be restored on any device and vice versa.
 */
export function downloadBackup(expenses: Expense[]) {
  const content = serializeSnapshot(expenses, Date.now());
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `expenses-${todayIso()}.json`;
  anchor.click();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readBackupFile(
  file: File,
): Promise<{ ok: true; snapshot: Snapshot } | { ok: false; reason: string }> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, reason: "Could not read that file." };
  }
  return parseSnapshot(text);
}
