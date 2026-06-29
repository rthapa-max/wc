"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixtureCard } from "@/app/components/FixtureCard";
import {
  compareByDateAndTime,
  filterDatesByPeriod,
  formatDateTabLabel,
  pickDefaultFixtureDateForPeriod,
  pickDefaultFixtureDatePeriod,
  type FixtureDatePeriod,
  type FixtureMatch,
} from "@/lib/fixtures";

type FixtureRow = {
  id: string;
  date_label: string;
  time: string;
  home: string;
  away: string;
  stage: string | null;
  group: string | null;
  stadium: string | null;
  city: string | null;
  status: "scheduled" | "pending" | "finished";
  kickoff_at: string | null;
  result_home_score: number | null;
  result_away_score: number | null;
  result_et_home_score: number | null;
  result_et_away_score: number | null;
  result_penalty_winner: "home" | "away" | null;
  result_penalty_home_score: number | null;
  result_penalty_away_score: number | null;
  knockout_scoring_version: "legacy" | "v2" | null;
};

const PERIOD_FILTERS: { id: FixtureDatePeriod; label: string }[] = [
  { id: "played", label: "Matches Played" },
  { id: "today", label: "Today's Matches" },
  { id: "upcoming", label: "Upcoming Matches" },
];

const EMPTY_PERIOD_MESSAGE: Record<FixtureDatePeriod, string> = {
  played: "No played matches yet.",
  today: "No matches scheduled for today.",
  upcoming: "No upcoming matches.",
};

function toMatch(r: FixtureRow): FixtureMatch {
  return {
    id: r.id,
    dateLabel: r.date_label,
    time: r.time,
    home: r.home,
    away: r.away,
    stage: r.stage ?? undefined,
    group: r.group ?? undefined,
    stadium: r.stadium ?? undefined,
    city: r.city ?? undefined,
    status: r.status ?? "scheduled",
    kickoffAt: r.kickoff_at ?? undefined,
    resultHomeScore: r.result_home_score,
    resultAwayScore: r.result_away_score,
    resultEtHomeScore: r.result_et_home_score,
    resultEtAwayScore: r.result_et_away_score,
    resultPenaltyWinner: r.result_penalty_winner,
    resultPenaltyHomeScore: r.result_penalty_home_score,
    resultPenaltyAwayScore: r.result_penalty_away_score,
    knockoutScoringVersion: r.knockout_scoring_version ?? "v2",
  };
}

export function FixturesFromSupabase() {
  const [dates, setDates] = useState<string[]>([]);
  const [matchPeriod, setMatchPeriod] = useState<FixtureDatePeriod>("today");
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [rows, setRows] = useState<FixtureRow[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filteredDates = useMemo(
    () => filterDatesByPeriod(dates, matchPeriod),
    [dates, matchPeriod],
  );

  const loadFixtures = useCallback(async (dateLabel: string) => {
    setLoadingFixtures(true);
    setError(null);

    const res = await fetch(`/api/fixtures?date=${encodeURIComponent(dateLabel)}`, {
      cache: "no-store",
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as
      | { ok: true; fixtures: FixtureRow[] }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setRows([]);
      setError(json && !json.ok ? json.message : "Could not load fixtures.");
      setLoadingFixtures(false);
      return;
    }

    setRows([...(json.fixtures ?? [])].sort(compareByDateAndTime));
    setLoadingFixtures(false);
  }, []);

  useEffect(() => {
    async function loadDates() {
      setLoadingDates(true);
      setError(null);

      const res = await fetch("/api/fixtures?dates=1", { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok: true; dates: string[] }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) {
        setDates([]);
        setError(json && !json.ok ? json.message : "Could not load fixture dates.");
        setLoadingDates(false);
        return;
      }

      const nextDates = json.dates ?? [];
      const initialPeriod = pickDefaultFixtureDatePeriod(nextDates);
      setDates(nextDates);
      setMatchPeriod(initialPeriod);
      setActiveDate(pickDefaultFixtureDateForPeriod(nextDates, initialPeriod));
      setLoadingDates(false);
    }

    void loadDates();
  }, []);

  useEffect(() => {
    if (filteredDates.length === 0) {
      setActiveDate(null);
      setRows([]);
      return;
    }

    if (!activeDate || !filteredDates.includes(activeDate)) {
      setActiveDate(pickDefaultFixtureDateForPeriod(dates, matchPeriod));
    }
  }, [activeDate, dates, filteredDates, matchPeriod]);

  useEffect(() => {
    if (!activeDate) return;
    void loadFixtures(activeDate);
  }, [activeDate, loadFixtures]);

  useEffect(() => {
    if (!activeDate) return;
    const tab = tabRefs.current[activeDate];
    tab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeDate, filteredDates]);

  if (loadingDates) {
    return <div className="py-4 text-sm text-secondary-text">Loading fixture dates…</div>;
  }

  if (dates.length === 0) {
    return (
      <div className="py-4 text-sm text-secondary-text">
        No fixtures found. Seed Supabase fixtures first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Match period"
        className="flex flex-wrap items-center gap-1 text-sm"
      >
        {PERIOD_FILTERS.map((period, index) => {
          const selected = period.id === matchPeriod;
          return (
            <div key={period.id} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="px-1 text-secondary-border" aria-hidden="true">
                  |
                </span>
              ) : null}
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMatchPeriod(period.id)}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  selected
                    ? "text-primary-600"
                    : "text-secondary-text hover:text-primary-text"
                }`}
              >
                {period.label}
              </button>
            </div>
          );
        })}
      </div>

      {filteredDates.length === 0 ? (
        <div className="py-8 text-center text-sm text-secondary-text">
          {EMPTY_PERIOD_MESSAGE[matchPeriod]}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto px-1 py-1.5 [scrollbar-width:thin]">
            <div
              role="tablist"
              aria-label="Fixture dates"
              className="flex w-max min-w-full gap-2 py-0.5"
            >
              {filteredDates.map((dateLabel) => {
                const selected = dateLabel === activeDate;
                return (
                  <button
                    key={dateLabel}
                    ref={(el) => {
                      tabRefs.current[dateLabel] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveDate(dateLabel)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? "border-primary-600 bg-primary-600 text-primary-foreground"
                        : "border-secondary-border bg-background text-secondary-text hover:bg-secondary-50"
                    }`}
                  >
                    {formatDateTabLabel(dateLabel)}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-600">
              {error}
            </div>
          ) : null}

          {loadingFixtures ? (
            <div className="py-12 text-center text-sm text-secondary-text">Loading fixtures…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-secondary-text">
              No fixtures on this date.
            </div>
          ) : (
            <div className="grid gap-5">
              {rows.map((row) => (
                <FixtureCard key={row.id} match={toMatch(row)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
