"use client";

import { useEffect, useState } from "react";
import { useData } from "@/components/DataProvider";
import { CATEGORIES, formatAmount, parseAmount, todayIso, type Expense } from "@/lib/expenses";

const inputClass =
  "h-10 rounded-lg border border-black/[.12] bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-white/[.16] dark:bg-zinc-900 dark:focus:border-zinc-500";

export default function ExpenseForm({
  editing,
  onDone,
}: {
  editing?: Expense;
  onDone?: () => void;
}) {
  const { addExpense, editExpense } = useData();

  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [amount, setAmount] = useState(editing ? formatAmount(editing.amount) : "");
  const [category, setCategory] = useState(editing?.category ?? CATEGORIES[0]);
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setDate(editing.date);
    setAmount(formatAmount(editing.amount));
    setCategory(editing.category);
    setNote(editing.note ?? "");
  }, [editing]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = parseAmount(amount);
    if (cents === null) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(null);

    const draft = { date, amount: cents, category, note: note.trim() || undefined };
    if (editing) await editExpense(editing.id, draft);
    else await addExpense(draft);

    if (!editing) {
      setAmount("");
      setNote("");
    }
    onDone?.();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.12]"
    >
      <div className="grid gap-3 sm:grid-cols-[9rem_7rem_1fr]">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
          aria-label="Date"
          className={inputClass}
        />
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          required
          aria-label="Amount"
          className={`${inputClass} text-right tabular-nums`}
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
          className={inputClass}
        >
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        aria-label="Note"
        className={inputClass}
      />

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="h-10 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {editing ? "Save changes" : "Add expense"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="h-10 rounded-full border border-black/[.12] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.16] dark:hover:bg-white/[.06]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
