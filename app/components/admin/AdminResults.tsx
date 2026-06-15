"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { compareByDateAndTime } from "@/lib/fixtures";

type FixtureRow = {
  id: string;
  date_label: string;
  time: string;
  home: string;
  away: string;
  status: "scheduled" | "pending" | "finished";
  result_home_score: number | null;
  result_away_score: number | null;
};

function normalizeScore(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "");
}

function parseScoreInput(raw: string): number {
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function AdminResultRow({
  row,
  busy,
  onSaveStatus,
  onComplete,
}: {
  row: FixtureRow;
  busy: boolean;
  onSaveStatus: (args: { id: string; status: "scheduled" | "pending" }) => void;
  onComplete: (args: { id: string; hs: string; as: string }) => void;
}) {
  const isFinished = row.status === "finished";
  const [hs, setHs] = useState(row.result_home_score === null ? "" : String(row.result_home_score));
  const [as, setAs] = useState(row.result_away_score === null ? "" : String(row.result_away_score));
  const [status, setStatus] = useState<"scheduled" | "pending">(
    row.status === "pending" ? "pending" : "scheduled",
  );

  useEffect(() => {
    setHs(row.result_home_score === null ? "" : String(row.result_home_score));
    setAs(row.result_away_score === null ? "" : String(row.result_away_score));
    setStatus(row.status === "pending" ? "pending" : "scheduled");
  }, [row.id, row.result_away_score, row.result_home_score, row.status]);

  return (
    <tr className="align-top">
      <td className="px-4 py-2">
        <div className="font-normal text-zinc-900 dark:text-zinc-50">
          {row.home} vs {row.away}
        </div>
      </td>
      <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
        {row.date_label} • {row.time}
      </td>
      <td className="px-4 py-2">
        {isFinished ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            finished
          </span>
        ) : (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "scheduled" | "pending")}
            className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
          >
            <option value="scheduled">scheduled</option>
            <option value="pending">pending</option>
          </select>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="grid grid-cols-[90px_20px_90px] items-center gap-2">
          <input
            value={hs}
            onChange={(e) => setHs(normalizeScore(e.target.value))}
            placeholder="0"
            inputMode="numeric"
            disabled={isFinished}
            className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950"
          />
          <div className="text-center text-zinc-500 dark:text-zinc-400">-</div>
          <input
            value={as}
            onChange={(e) => setAs(normalizeScore(e.target.value))}
            placeholder="0"
            inputMode="numeric"
            disabled={isFinished}
            className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950"
          />
        </div>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {!isFinished ? (
            <button
              type="button"
              onClick={() => onSaveStatus({ id: row.id, status })}
              disabled={busy}
              className="inline-flex h-8 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          ) : null}
          {!isFinished ? (
            <button
              type="button"
              onClick={() => onComplete({ id: row.id, hs, as })}
              disabled={busy}
              className="inline-flex h-8 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {busy ? "Saving…" : "Complete"}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function AdminResults() {
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/fixtures", { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok: true; fixtures: FixtureRow[] }
        | { ok: false; message: string }
        | null;
      if (!res || !json || !json.ok) {
        setRows([]);
        setLoading(false);
        return;
      }
      setRows(json.fixtures ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter((r) =>
          `${r.home} ${r.away} ${r.date_label} ${r.time}`.toLowerCase().includes(needle),
        )
      : rows;
    return [...list].sort(compareByDateAndTime);
  }, [q, rows]);

  if (!ready) return <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>;
  if (!user) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Log in to access admin.</div>;
  }
  if (!user.isAdmin) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Not authorized.</div>;
  }

  async function saveStatus(id: string, status: "scheduled" | "pending") {
    setErr(null);
    setBusyId(id);
    const res = await fetch("/api/admin/results", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: id, status }),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setErr(json && "message" in json ? json.message : "Failed to save status.");
      setBusyId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id !== id ? r : { ...r, status })));
    setBusyId(null);
  }

  async function complete(id: string, hs: string, as: string) {
    setErr(null);
    setBusyId(id);
    const homeScore = parseScoreInput(hs);
    const awayScore = parseScoreInput(as);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      setErr("Enter valid scores before marking complete.");
      setBusyId(null);
      return;
    }

    const res = await fetch("/api/admin/results", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fixtureId: id,
        complete: true,
        homeScore: Math.floor(homeScore),
        awayScore: Math.floor(awayScore),
      }),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setErr(json && "message" in json ? json.message : "Failed to complete match.");
      setBusyId(null);
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id !== id
          ? r
          : {
              ...r,
              status: "finished",
              result_home_score: Math.floor(homeScore),
              result_away_score: Math.floor(awayScore),
            },
      ),
    );
    window.dispatchEvent(new Event("wc:predictions-changed"));
    setBusyId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (team, date, time)…"
          className="h-9 w-full max-w-md rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-white/10 dark:bg-zinc-950 dark:focus:ring-white/20"
        />
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading fixtures…</div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
              <tr>
                <th className="px-4 py-2 font-normal">Match</th>
                <th className="px-4 py-2 font-normal">When</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Result</th>
                <th className="px-4 py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800 dark:divide-white/10 dark:text-zinc-200">
              {filtered.slice(0, 200).map((r) => (
                <AdminResultRow
                  key={r.id}
                  row={r}
                  busy={busyId === r.id}
                  onSaveStatus={({ id, status }) => void saveStatus(id, status)}
                  onComplete={({ id, hs, as }) => void complete(id, hs, as)}
                />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            Showing up to 200 matches.
          </div>
        </div>
      )}
    </div>
  );
}
