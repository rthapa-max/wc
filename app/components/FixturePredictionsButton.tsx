"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import { predictionPointsLabel } from "@/lib/scoring";

type PredictionRow = {
  userId: string;
  displayName: string;
  winner: "home" | "away" | "draw";
  homeScore: number;
  awayScore: number;
  knockoutExtras: string | null;
  points: number;
  pointsLabel?: string;
};

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FixturePredictionsButton({
  fixtureId,
  matchLabel,
}: {
  fixtureId: string;
  matchLabel: string;
}) {
  const titleId = useId();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadPredictions = useCallback(async () => {
    if (!user) {
      setRows([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/fixtures/${encodeURIComponent(fixtureId)}/predictions`, {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | {
          ok: true;
          predictions: PredictionRow[];
        }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setRows([]);
      setError(json && "message" in json ? json.message : "Failed to load predictions.");
      setLoading(false);
      return;
    }

    setRows(json.predictions ?? []);
    setLoading(false);
  }, [fixtureId, user]);

  useEffect(() => {
    if (!open) return;
    void loadPredictions();
  }, [open, loadPredictions]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View all predictions for this match"
        title="View all predictions"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-secondary-border bg-background text-secondary-text transition-colors hover:bg-primary-50 hover:text-primary-700"
      >
        <UsersIcon />
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
              <div className="my-auto w-full max-w-md rounded-2xl border border-secondary-border bg-background shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b border-secondary-75 px-5 py-4">
                  <div className="min-w-0">
                    <h2 id={titleId} className="text-sm font-medium text-primary-text">
                      All predictions
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-secondary-text">{matchLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full px-3 py-1.5 text-xs text-secondary-text hover:bg-surface-blue-400"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-4">
                  {!user ? (
                    <p className="py-6 text-center text-sm text-secondary-text">
                      Log in to see everyone&apos;s predictions for this match.
                    </p>
                  ) : loading ? (
                    <p className="py-6 text-center text-sm text-secondary-text">Loading…</p>
                  ) : error ? (
                    <p className="py-6 text-center text-sm text-danger-600">{error}</p>
                  ) : rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-secondary-text">
                      No predictions were submitted for this match.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {rows.map((row) => {
                        const isYou = user?.id === row.userId;
                        return (
                          <li
                            key={row.userId}
                            className={
                              isYou
                                ? "rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5"
                                : "rounded-xl border border-secondary-border bg-surface-blue-400/40 px-3 py-2.5"
                            }
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-primary-text">
                                  {row.displayName}
                                  {isYou ? (
                                    <span className="ml-1.5 font-normal text-primary-600">(you)</span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-[11px] text-secondary-text">
                                  {row.pointsLabel ?? predictionPointsLabel(row.points)}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-0.5">
                                <div className="text-sm font-semibold tabular-nums text-primary-text">
                                  {row.homeScore}-{row.awayScore}
                                </div>
                                {row.knockoutExtras ? (
                                  <span className="inline-flex max-w-44 items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium leading-snug text-primary-700 ring-1 ring-primary-200">
                                    <span aria-hidden="true">⚽</span>
                                    <span className="truncate">{row.knockoutExtras}</span>
                                  </span>
                                ) : null}
                                <div className="text-[11px] font-medium text-primary-600">
                                  {row.points} {row.points === 1 ? "pt" : "pts"}
                                </div>
                              </div>
                            </div>
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
