"use client";

import BackupPanel from "@/components/BackupPanel";
import DataProvider, { useData } from "@/components/DataProvider";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseList from "@/components/ExpenseList";

function Tracker() {
  const { ready } = useData();

  if (!ready) {
    return (
      <p className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading…
      </p>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Expense Tracker</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Saved on this device. Back up to a file or Google Drive whenever you like.
        </p>
      </header>

      <ExpenseForm />
      <ExpenseList />
      <BackupPanel />
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <DataProvider>
        <Tracker />
      </DataProvider>
    </main>
  );
}
