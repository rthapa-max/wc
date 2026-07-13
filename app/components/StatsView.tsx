"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { Superlatives } from "@/app/components/Superlatives";
import { flagUrlForTeam } from "@/lib/fixtures";
import type { FunAward, FunFact, TournamentStatsTotals, UserStatsRow } from "@/lib/predictionStats";

function PlayerFlag({ team }: { team: string }) {
  const flagUrl = flagUrlForTeam(team, 40);
  if (!flagUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={flagUrl}
      alt=""
      width={18}
      height={14}
      className="h-3.5 w-[1.125rem] shrink-0 rounded-[2px] object-cover ring-1 ring-secondary-border"
    />
  );
}

function displayName(row: UserStatsRow) {
  if (row.username) return row.username;
  if (row.email) return row.email.split("@")[0] ?? row.email;
  return "Player";
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-secondary-border bg-background px-4 py-3.5">
      <div className="text-xs text-secondary-text">{label}</div>
      <div className="mt-1 font-semibold text-xl tabular-nums text-primary-text sm:text-2xl">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-secondary-text">{hint}</div> : null}
    </div>
  );
}

export function StatsView() {
  const { user, ready: authReady } = useAuth();
  const [rows, setRows] = useState<UserStatsRow[]>([]);
  const [totals, setTotals] = useState<TournamentStatsTotals | null>(null);
  const [awards, setAwards] = useState<FunAward[]>([]);
  const [facts, setFacts] = useState<FunFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/stats", { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | {
            ok: true;
            rows: UserStatsRow[];
            totals: TournamentStatsTotals;
            awards: FunAward[];
            facts: FunFact[];
          }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) {
        setRows([]);
        setTotals(null);
        setAwards([]);
        setFacts([]);
        setError((json && !json.ok && json.message) || "Could not load stats.");
        setLoading(false);
        return;
      }

      setRows(json.rows ?? []);
      setTotals(json.totals ?? null);
      setAwards(json.awards ?? []);
      setFacts(json.facts ?? []);
      setLoading(false);
    }

    void load();
    const onChange = () => void load();
    window.addEventListener("wc:predictions-changed", onChange);
    return () => window.removeEventListener("wc:predictions-changed", onChange);
  }, []);

  const myIndex = rows.findIndex((row) => row.userId === user?.id);
  const mine = myIndex >= 0 ? rows[myIndex] : null;

  return (
    <div className="space-y-8 sm:space-y-10">
      {authReady && user ? (
        <section>
          <div className="mb-4 sm:mb-5">
            <h2 className="font-semibold text-base text-primary-text sm:text-lg">Your stats</h2>
            <p className="mt-1.5 text-sm text-secondary-text">
              {loading
                ? "Loading…"
                : mine
                  ? `Rank #${myIndex + 1} of ${rows.length}`
                  : "Make a prediction to appear here."}
            </p>
          </div>
          {mine ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile label="Points" value={mine.totalPoints} />
              <StatTile label="Exact scores" value={mine.exactScores} hint="Matched the final score" />
              <StatTile
                label="Correct outcome"
                value={mine.correctOutcome}
                hint="Right winner, wrong score"
              />
              <StatTile label="Wrong outcome" value={mine.wrongOutcome} />
              <StatTile label="Predictions made" value={mine.totalPredictions} />
              <StatTile label="Awaiting result" value={mine.awaiting} />
              <StatTile
                label="Exact score %"
                value={mine.exactPct != null ? `${mine.exactPct}%` : "—"}
                hint="Of finished matches"
              />
              <StatTile
                label="Outcome accuracy"
                value={mine.outcomePct != null ? `${mine.outcomePct}%` : "—"}
                hint="Exact + correct winner"
              />
              <StatTile
                label="Draw calls"
                value={`${mine.drawCorrect}/${mine.drawPredictions}`}
                hint="Correct draw predictions"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {totals ? (
        <section>
          <div className="mb-4 sm:mb-5">
            <h2 className="font-semibold text-base text-primary-text sm:text-lg">
              Tournament totals
            </h2>
            <p className="mt-1.5 text-sm text-secondary-text">Across every player, all matches.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Players" value={totals.players} />
            <StatTile label="Predictions" value={totals.totalPredictions} />
            <StatTile label="Matches scored" value={totals.finishedScored} />
            <StatTile label="Exact scores" value={totals.exactScores} />
            <StatTile label="Correct outcome" value={totals.correctOutcome} />
            <StatTile label="Total points" value={totals.totalPoints} />
          </div>
        </section>
      ) : null}

      <Superlatives awards={awards} facts={facts} loading={loading} />

      <section className="overflow-hidden rounded-2xl border border-secondary-border bg-background shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-secondary-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-base text-primary-text">All players</h2>
            <p className="mt-0.5 text-xs text-secondary-text">Your row is highlighted</p>
          </div>
          <span className="text-sm text-secondary-text">
            {loading ? "Loading…" : `${rows.length} player${rows.length === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="py-10 text-center text-sm text-secondary-text">Loading stats…</div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-secondary-text">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-secondary-text">No stats yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-borderless w-full text-left text-sm">
                <thead className="text-xs text-secondary-text">
                  <tr>
                    <th className="pb-3 pl-4 pr-4 font-normal sm:pl-6">#</th>
                    <th className="pb-3 pr-4 font-normal">Player</th>
                    <th className="pb-3 pr-4 text-right font-normal">Pts</th>
                    <th className="pb-3 pr-4 text-right font-normal">Picks</th>
                    <th className="pb-3 pr-4 text-right font-normal">Exact</th>
                    <th className="pb-3 pr-4 text-right font-normal">Correct</th>
                    <th className="pb-3 pr-4 text-right font-normal">Wrong</th>
                    <th className="pb-3 pl-4 pr-4 text-right font-normal sm:pr-6">Exact %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-75 text-primary-text">
                  {rows.map((row, index) => {
                    const isYou = row.userId === user?.id;
                    const isLeader = index === 0;
                    return (
                      <tr
                        key={row.userId}
                        aria-current={isYou ? "true" : undefined}
                        className={
                          isYou && isLeader
                            ? "bg-linear-to-r from-yellow-300/50 via-primary-100 to-primary-50 ring-2 ring-inset ring-primary-500"
                            : isYou
                              ? "bg-primary-50 ring-2 ring-inset ring-primary-400"
                              : isLeader
                                ? "bg-linear-to-r from-yellow-300/50 via-primary-50 to-surface-blue-50"
                                : "hover:bg-secondary-50"
                        }
                      >
                        <td className="py-3.5 pl-4 pr-4 sm:pl-6">
                          <span
                            className={`tabular-nums ${isYou ? "font-semibold text-primary-700" : "text-gray-400"}`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="max-w-[12rem] py-3.5 pr-4" title={row.email}>
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <span
                              className={`truncate ${isLeader || isYou ? "font-semibold text-primary-dark" : ""}`}
                            >
                              {displayName(row)}
                            </span>
                            {isYou ? (
                              <span className="shrink-0 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                                You
                              </span>
                            ) : null}
                            {row.favoriteTeam ? <PlayerFlag team={row.favoriteTeam} /> : null}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 text-right font-semibold tabular-nums">
                          {row.totalPoints}
                        </td>
                        <td className="py-3.5 pr-4 text-right tabular-nums text-secondary-text">
                          {row.totalPredictions}
                        </td>
                        <td className="py-3.5 pr-4 text-right tabular-nums text-secondary-text">
                          {row.exactScores}
                        </td>
                        <td className="py-3.5 pr-4 text-right tabular-nums text-secondary-text">
                          {row.correctOutcome}
                        </td>
                        <td className="py-3.5 pr-4 text-right tabular-nums text-secondary-text">
                          {row.wrongOutcome}
                        </td>
                        <td className="py-3.5 pl-4 pr-4 text-right tabular-nums text-secondary-text sm:pr-6">
                          {row.exactPct != null ? `${row.exactPct}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
