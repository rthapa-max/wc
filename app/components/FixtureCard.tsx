"use client";

import { useEffect, useMemo, useState } from "react";
import type { FixtureMatch } from "@/lib/fixtures";
import { flagUrlForTeam } from "@/lib/fixtures";
import {
  formatKickoffLocal,
  getPredictionWindowState,
  kickoffMsFromFixtureRow,
} from "@/lib/kickoff";
import { predictionPoints, predictionPointsClass } from "@/lib/scoring";
import { useAuth } from "@/app/components/AuthProvider";
import { FixturePredictionsButton } from "@/app/components/FixturePredictionsButton";

type WinnerPick = "home" | "away" | "draw";

type Prediction = {
  winner: WinnerPick;
  homeScore: number;
  awayScore: number;
  updatedAt: number;
};

function predictionKey(matchKey: string) {
  return `wc:prediction:${matchKey}`;
}

function getMatchKey(m: FixtureMatch) {
  // Must be stable across renders and unique in list.
  return `${m.dateLabel}|${m.time}|${m.home}|${m.away}|${m.stage ?? ""}|${m.group ?? ""}|${
    m.stadium ?? ""
  }`;
}

function TeamWithFlag({ team, reverse = false }: { team: string; reverse?: boolean }) {
  const flagUrl = flagUrlForTeam(team, 40);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}
    >
      {flagUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl}
          alt=""
          width={20}
          height={15}
          className="h-[15px] w-5 shrink-0 rounded-[2px] ring-1 ring-secondary-border"
          loading="lazy"
        />
      ) : null}
      <span className="whitespace-nowrap text-base font-medium">{team}</span>
    </span>
  );
}

function formatLocation(stadium?: string, city?: string) {
  if (!stadium && !city) return undefined;
  if (stadium && city) return `${stadium} (${city})`;
  return stadium ?? city;
}

function winnerLabel(pick: WinnerPick, m: FixtureMatch) {
  if (pick === "draw") return "Draw";
  return pick === "home" ? m.home : m.away;
}

export function FixtureCard({ match }: { match: FixtureMatch }) {
  const matchKey = useMemo(() => getMatchKey(match), [match]);
  const fixtureId = match.id ?? matchKey;
  const { user, ready } = useAuth();

  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [homeScore, setHomeScore] = useState<string>("");
  const [awayScore, setAwayScore] = useState<string>("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  function normalizeScoreInput(raw: string) {
    const digitsOnly = raw.replace(/[^\d]/g, "");
    if (digitsOnly.length === 0) return "";
    // Remove leading zeros (but keep a single "0" if the whole input is zeros)
    const trimmed = digitsOnly.replace(/^0+(?=\d)/, "");
    return trimmed;
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(predictionKey(matchKey));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Prediction;
      if (
        parsed &&
        (parsed.winner === "home" || parsed.winner === "away" || parsed.winner === "draw") &&
        Number.isFinite(parsed.homeScore) &&
        Number.isFinite(parsed.awayScore)
      ) {
        setPrediction(parsed);
      }
    } catch {
      // ignore
    }
  }, [matchKey]);

  useEffect(() => {
    async function loadFromDb() {
      if (!user) return;
      const res = await fetch(`/api/predictions?fixtureId=${encodeURIComponent(fixtureId)}`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | {
            ok: true;
            prediction: {
              winner: "home" | "away" | "draw";
              home_score: number;
              away_score: number;
              updated_at: string;
            } | null;
          }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) return;

      if (!json.prediction) {
        setPrediction(null);
        setHomeScore("");
        setAwayScore("");
        try {
          localStorage.removeItem(predictionKey(matchKey));
        } catch {
          // ignore
        }
        return;
      }

      const data = json.prediction;
      const next: Prediction = {
        winner:
          data.winner === "home" || data.winner === "away" || data.winner === "draw"
            ? data.winner
            : "draw",
        homeScore: Number(data.home_score ?? 0),
        awayScore: Number(data.away_score ?? 0),
        updatedAt: new Date(data.updated_at ?? Date.now()).getTime(),
      };
      setPrediction(next);
      setHomeScore(next.homeScore === 0 ? "" : String(next.homeScore));
      setAwayScore(next.awayScore === 0 ? "" : String(next.awayScore));
    }

    void loadFromDb();
  }, [fixtureId, user, matchKey]);

  useEffect(() => {
    if (!user) {
      // Logged out: keep local draft empty, but show last local saved prediction if present.
      setServerError(null);
    }
  }, [user]);

  const kickoffMs = useMemo(() => {
    if (match.kickoffAt) return new Date(match.kickoffAt).getTime();
    return kickoffMsFromFixtureRow({ dateLabel: match.dateLabel, time: match.time });
  }, [match.dateLabel, match.kickoffAt, match.time]);

  const predictionWindow = useMemo(
    () => getPredictionWindowState(kickoffMs, nowMs),
    [kickoffMs, nowMs],
  );

  const kickoffTimeLabel = useMemo(
    () => formatKickoffLocal(kickoffMs) ?? match.time,
    [kickoffMs, match.time],
  );

  async function save() {
    if (!user || !isPending || !predictionWindow.open) return;
    const hs = homeScore === "" ? 0 : Number(homeScore);
    const as = awayScore === "" ? 0 : Number(awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) return;

    setServerError(null);
    setSaving(true);

    const derivedWinner: WinnerPick = hs === as ? "draw" : hs > as ? "home" : "away";
    const next: Prediction = {
      winner: derivedWinner,
      homeScore: Math.floor(hs),
      awayScore: Math.floor(as),
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(predictionKey(matchKey), JSON.stringify(next));
    } catch {
      // ignore
    }

    const res = await fetch("/api/predictions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fixtureId,
        winner: next.winner,
        homeScore: next.homeScore,
        awayScore: next.awayScore,
      }),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setServerError(json && "message" in json ? json.message : "Failed to save to server.");
      setSaving(false);
      return;
    }

    setPrediction(next);
    window.dispatchEvent(new Event("wc:predictions-changed"));
    setSaving(false);
  }

  async function clear() {
    setServerError(null);
    try {
      localStorage.removeItem(predictionKey(matchKey));
    } catch {
      // ignore
    }
    if (!user) return;

    setSaving(true);
    const res = await fetch(`/api/predictions?fixtureId=${encodeURIComponent(fixtureId)}`, {
      method: "DELETE",
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setServerError(json && "message" in json ? json.message : "Failed to delete on server.");
      setSaving(false);
      return;
    }

    setPrediction(null);
    setHomeScore("");
    setAwayScore("");
    window.dispatchEvent(new Event("wc:predictions-changed"));
    setSaving(false);
  }

  const location = formatLocation(match.stadium, match.city);
  const fixtureStatus = match.status ?? "scheduled";
  const isPending = fixtureStatus === "pending";
  const isFinished = fixtureStatus === "finished";
  const canPredict = isPending && predictionWindow.open && ready && !!user && !saving;
  const hasResult =
    isFinished &&
    match.resultHomeScore != null &&
    match.resultAwayScore != null &&
    Number.isFinite(match.resultHomeScore) &&
    Number.isFinite(match.resultAwayScore);

  const earnedPoints = useMemo(() => {
    if (!hasResult || !prediction) return null;
    return predictionPoints(
      prediction.homeScore,
      prediction.awayScore,
      match.resultHomeScore!,
      match.resultAwayScore!,
    );
  }, [hasResult, prediction, match.resultHomeScore, match.resultAwayScore]);

  return (
    <div className="relative rounded-2xl border border-secondary-border bg-background p-5 shadow-sm sm:p-6">
      {hasResult ? (
        <div className="absolute left-4 top-4 sm:left-5 sm:top-5">
          <FixturePredictionsButton
            fixtureId={fixtureId}
            matchLabel={`${match.home} vs ${match.away}`}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-5 sm:gap-6">
        <div className="flex flex-col items-center gap-4 sm:gap-5">
          <div className="flex items-center justify-center gap-8 sm:gap-12">
            <TeamWithFlag team={match.home} />
            <span className="text-xs font-medium text-gray-300">·</span>
            <TeamWithFlag team={match.away} reverse />
          </div>

          {isFinished ? (
            <div className="flex flex-col items-center gap-3">
              {hasResult ? (
                <div className="flex items-center justify-center gap-4">
                  <span className="min-w-10 text-center text-2xl font-semibold tabular-nums text-primary-text">
                    {match.resultHomeScore}
                  </span>
                  <span className="text-sm font-medium text-gray-300">vs</span>
                  <span className="min-w-10 text-center text-2xl font-semibold tabular-nums text-primary-text">
                    {match.resultAwayScore}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-secondary-text">Final score not recorded</p>
              )}
              <p className="text-xs font-medium uppercase tracking-wide text-secondary-text">
                Final score
              </p>
              {prediction ? (
                <p className="text-sm text-tertiary-700">
                  Your prediction:{" "}
                  <span className="rounded-md bg-primary-50 px-1.5 py-0.5 font-semibold tabular-nums text-primary-700">
                    {prediction.homeScore}-{prediction.awayScore}
                  </span>
                  {earnedPoints != null ? (
                    <span className={`ml-1.5 ${predictionPointsClass(earnedPoints)}`}>
                      {earnedPoints} {earnedPoints === 1 ? "point" : "points"}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-tertiary-700">
                  No prediction submitted{" "}
                  <span className={predictionPointsClass(0)}>0 points</span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <input
                inputMode="numeric"
                value={homeScore}
                onChange={(e) => setHomeScore(normalizeScoreInput(e.target.value))}
                disabled={!canPredict}
                className="h-10 w-14 rounded-lg border border-secondary-border bg-background px-1 text-center text-sm tabular-nums outline-none focus:border-secondary-300 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
                placeholder="0"
                aria-label={`${match.home} score`}
              />
              <span className="text-sm font-medium text-gray-300">vs</span>
              <input
                inputMode="numeric"
                value={awayScore}
                onChange={(e) => setAwayScore(normalizeScoreInput(e.target.value))}
                disabled={!canPredict}
                className="h-10 w-14 rounded-lg border border-secondary-border bg-background px-1 text-center text-sm tabular-nums outline-none focus:border-secondary-300 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
                placeholder="0"
                aria-label={`${match.away} score`}
              />
            </div>
          )}
        </div>

        <div className="min-w-0">

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-secondary-text">
            <span
              className={
                isPending
                  ? "rounded-full bg-yellow-300 px-2 py-0.5 text-brown-500"
                  : isFinished
                    ? "rounded-full bg-primary-50 px-2 py-0.5 text-primary-700"
                    : "rounded-full bg-surface-blue-400 px-2 py-0.5 text-primary-700"
              }
            >
              {fixtureStatus}
            </span>
            {match.kickoffAt ? (
              <time
                dateTime={match.kickoffAt}
                className="font-normal text-primary-text"
              >
                {kickoffTimeLabel}
              </time>
            ) : (
              <span className="font-normal text-primary-text">{kickoffTimeLabel}</span>
            )}
            {match.stage ? <span>{match.stage}</span> : null}
            {match.group ? <span>{match.group}</span> : null}
          </div>

          {location ? (
            <div className="mt-2 text-xs text-secondary-text">{location}</div>
          ) : null}

          {isPending && !predictionWindow.open && predictionWindow.reason ? (
            <div className="mt-2 text-xs text-secondary-text">{predictionWindow.reason}</div>
          ) : null}

          {prediction && !isFinished ? (
            <div className="mt-2 text-xs text-tertiary-700">
              Predicted:{" "}
              <span className="font-normal text-primary-text">
                {winnerLabel(prediction.winner, match)} {prediction.homeScore}-{prediction.awayScore}
              </span>
            </div>
          ) : null}

          {serverError ? (
            <div className="mt-2 rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-600">
              {serverError}
            </div>
          ) : null}
        </div>

        <div className="border-t border-secondary-75 pt-4 sm:pt-5">
          {!ready ? null : isFinished ? null : !isPending ? (
            <p className="text-center text-xs text-secondary-text">Predictions closed</p>
          ) : !predictionWindow.open ? (
            <p className="text-center text-xs text-secondary-text">Outside prediction window</p>
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="shadow-claros-button inline-flex h-10 w-full items-center justify-center rounded-full bg-primary-600 font-semibold text-sm text-primary-foreground transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save prediction"}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

