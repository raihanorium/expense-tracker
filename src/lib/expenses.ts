export type Expense = {
  id: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Minor units (cents) as an integer — avoids float drift on sums. */
  amount: number;
  category: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

export const CATEGORIES = [
  "Food",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Other",
] as const;

export function newId() {
  // Available in secure contexts, which covers https and localhost.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function todayIso() {
  // Local calendar date, not UTC — an expense at 1am shouldn't land on yesterday.
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Parses user input like "12.34" into integer cents. Returns null if unusable. */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function formatAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

export function formatDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Newest first, with a stable tiebreak so ordering doesn't jitter between renders. */
export function sortExpenses(expenses: Expense[]) {
  return [...expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
}

export function groupByDate(expenses: Expense[]) {
  const groups = new Map<string, Expense[]>();
  for (const expense of sortExpenses(expenses)) {
    const bucket = groups.get(expense.date);
    if (bucket) bucket.push(expense);
    else groups.set(expense.date, [expense]);
  }
  return [...groups.entries()];
}

export function sumAmount(expenses: Expense[]) {
  return expenses.reduce((total, expense) => total + expense.amount, 0);
}
