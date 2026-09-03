"use client";

import { useState } from "react";
import { useData } from "@/components/DataProvider";
import ExpenseForm from "@/components/ExpenseForm";
import { formatAmount, formatDate, groupByDate, sumAmount } from "@/lib/expenses";

export default function ExpenseList() {
  const { expenses, removeExpense } = useData();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (expenses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-black/[.12] px-4 py-12 text-center text-sm text-zinc-500 dark:border-white/[.16] dark:text-zinc-400">
        No expenses yet. Add your first one above.
      </p>
    );
  }

  const editing = expenses.find((item) => item.id === editingId);
  const groups = groupByDate(expenses);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between border-b border-black/[.08] pb-2 dark:border-white/[.12]">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
        </span>
        <span className="text-lg font-semibold tabular-nums">{formatAmount(sumAmount(expenses))}</span>
      </div>

      {editing && (
        <ExpenseForm editing={editing} onDone={() => setEditingId(null)} />
      )}

      {groups.map(([date, rows]) => (
        <section key={date} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-medium">{formatDate(date)}</h2>
            <span className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
              {formatAmount(sumAmount(rows))}
            </span>
          </div>

          <ul className="divide-y divide-black/[.06] overflow-hidden rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.12]">
            {rows.map((expense) => (
              <li
                key={expense.id}
                className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-sm hover:bg-black/[.02] dark:hover:bg-white/[.03]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{expense.category}</p>
                  {expense.note && (
                    <p className="truncate text-zinc-500 dark:text-zinc-400">{expense.note}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatAmount(expense.amount)}</span>
                  <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setEditingId(expense.id)}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-black/[.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeExpense(expense.id)}
                      className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
