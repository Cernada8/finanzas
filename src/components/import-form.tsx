"use client";

import { useActionState } from "react";
import { importTransactionsFile, type ImportOutcome } from "@/app/connections/actions";

export function ImportForm({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState<ImportOutcome | null, FormData>(importTransactionsFile, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Target account
          <select name="accountId" required className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <option value="">Select an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          CSV or XLSX file
          <input
            name="file"
            type="file"
            accept=".csv,.xlsx"
            required
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--series-1)" }}
      >
        {pending ? "Importing…" : "Import"}
      </button>
      {state && (
        <p className="text-sm" style={{ color: state.ok ? "var(--status-good)" : "var(--status-critical)" }}>
          {state.message}
        </p>
      )}
      <p className="text-xs text-[var(--text-muted)]">
        Column headers are auto-detected (Spanish/English synonyms for date, amount, description). Locale defaults to es-ES number/date
        formatting. Duplicate rows and rows that fail to parse are reported, not silently dropped.
      </p>
    </form>
  );
}
