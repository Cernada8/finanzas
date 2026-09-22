import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ImportForm } from "@/components/import-form";
import { runDemoSync } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  UNCONFIGURED: "var(--text-muted)",
  CONNECTING: "var(--series-1)",
  CONSENT_REQUIRED: "var(--status-warning)",
  SYNCING: "var(--series-1)",
  CURRENT: "var(--status-good)",
  STALE: "var(--status-warning)",
  PARTIALLY_SUPPORTED: "var(--status-warning)",
  FAILED: "var(--status-critical)",
  DISCONNECTED: "var(--text-muted)",
};

export default async function ConnectionsPage() {
  let owner;
  try {
    owner = await requireOwner();
  } catch {
    redirect("/login");
  }

  const [institutions, accounts] = await Promise.all([
    prisma.institution.findMany({
      where: { ownerId: owner.id },
      include: { connections: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.account.findMany({ where: { ownerId: owner.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Connections &amp; imports</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          See docs/integration-feasibility.md for why each real institution below is currently unconfigured, rather than connected.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-5 py-3 font-normal">Institution</th>
              <th className="px-5 py-3 font-normal">Status</th>
              <th className="px-5 py-3 font-normal">Capabilities</th>
              <th className="px-5 py-3 font-normal">Last sync</th>
              <th className="px-5 py-3 font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {institutions.map((inst) => {
              const conn = inst.connections[0];
              const caps = (conn?.capabilities as Record<string, boolean> | undefined) ?? {};
              const supportedCaps = Object.entries(caps)
                .filter(([, v]) => v)
                .map(([k]) => k);
              return (
                <tr key={inst.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{inst.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{inst.providerKind}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                      style={{ borderColor: "var(--border)", color: STATUS_COLOR[conn?.status ?? "UNCONFIGURED"] }}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: STATUS_COLOR[conn?.status ?? "UNCONFIGURED"] }}
                      />
                      {conn?.status ?? "UNCONFIGURED"}
                    </span>
                    {conn?.lastErrorRedacted && <div className="mt-1 text-xs text-[var(--text-muted)]">{conn.lastErrorRedacted}</div>}
                  </td>
                  <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                    {supportedCaps.length > 0 ? supportedCaps.join(", ") : "none"}
                  </td>
                  <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                    {conn?.lastSuccessAt ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(conn.lastSuccessAt) : "never"}
                  </td>
                  <td className="px-5 py-3">
                    {inst.providerKind === "DEMO" ? (
                      <form action={runDemoSync}>
                        <button type="submit" className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                          Sync now
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">Import statements below</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Import a statement (CSV / XLSX)</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Works for any institution, including Trade Republic and MyInvestor investment exports. Re-importing the same file is safe — it
          will not create duplicates.
        </p>
        <div className="mt-4">
          <ImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      </div>
    </div>
  );
}
