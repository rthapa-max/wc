"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import { formatKnockoutExtrasLine } from "@/lib/knockoutPrediction";

type Row = {
  fixture_id: string;
  winner: "home" | "away" | "draw";
  home_score: number;
  away_score: number;
  et_home_score: number | null;
  et_away_score: number | null;
  penalty_winner: "home" | "away" | null;
  updated_at: string;
  fixtures?: {
    home: string;
    away: string;
    date_label: string;
    time: string;
    stage?: string | null;
  } | null;
};

function winnerText(r: Row) {
  if (r.winner === "draw") return "Draw";
  return r.winner === "home" ? (r.fixtures?.home ?? "Home") : (r.fixtures?.away ?? "Away");
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 8v4l3 2M21 12a9 9 0 1 1-3-6.7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PredictionHistoryButton() {
  const titleId = useId();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setRows([]);
      return;
    }
    setLoading(true);
    const res = await fetch("/api/predictions/history", { cache: "no-store" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok: true; predictions: Row[] }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(json.predictions ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    void loadHistory();
  }, [open, loadHistory]);

  useEffect(() => {
    if (!user) return;
    const onChange = () => {
      if (open) void loadHistory();
    };
    window.addEventListener("wc:predictions-changed", onChange);
    return () => window.removeEventListener("wc:predictions-changed", onChange);
  }, [user, open, loadHistory]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View prediction history"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 transition-colors hover:bg-zinc-50 sm:px-3 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-white/5"
      >
        <HistoryIcon />
        <span className="hidden sm:inline">History</span>
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="my-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-white/10">
                  <div className="min-w-0">
                    <h2 id={titleId} className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      Your predictions
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {user ? user.email : "Sign in to see saved picks"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-4">
                  {!user ? (
                    <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      Log in to see your prediction history.
                    </p>
                  ) : loading ? (
                    <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
                  ) : rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No predictions yet. Enter scores on a match below.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {rows.map((row) => {
                        const home = row.fixtures?.home ?? "Home";
                        const away = row.fixtures?.away ?? "Away";
                        const knockoutExtras = formatKnockoutExtrasLine(
                          row.home_score,
                          row.away_score,
                          row.et_home_score,
                          row.et_away_score,
                          row.penalty_winner,
                          home,
                          away,
                        );

                        return (
                        <li
                          key={row.fixture_id}
                          className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
                        >
                          <div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-50">
                            {home + " vs " + away}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {row.fixtures?.date_label}
                            {row.fixtures?.time ? ` · ${row.fixtures.time}` : ""}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-700 dark:text-zinc-300">
                            <span>
                              Pick:{" "}
                              <span className="text-zinc-900 dark:text-zinc-50">{winnerText(row)}</span>
                            </span>
                            <span className="text-zinc-300 dark:text-zinc-600">|</span>
                            <span>
                              Score:{" "}
                              <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                                {row.home_score}-{row.away_score}
                              </span>
                            </span>
                          </div>
                          {knockoutExtras ? (
                            <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                              {knockoutExtras}
                            </div>
                          ) : null}
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
