"use client";

import { useEffect, useMemo, useState } from "react";
import type { FixtureMatch } from "@/lib/fixtures";
import { flagUrlForTeam } from "@/lib/fixtures";
import {
  etScoresFromWinner,
  etWinnerFromScores,
  formatKnockoutPredictionSummary,
  formatPenaltyShootoutResult,
  isDrawScore,
  penaltyWinnerFromScores,
  validateKnockoutPrediction,
  type EtWinnerPick,
  type SidePick,
} from "@/lib/knockoutPrediction";
import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";
import {
  formatKickoffLocal,
  getPredictionWindowState,
  kickoffMsFromFixtureRow,
} from "@/lib/kickoff";
import { predictionPoints, predictionPointsClass, predictionPointsLabel } from "@/lib/scoring";
import { isKnockoutStage } from "@/lib/teams";
import { useAuth } from "@/app/components/AuthProvider";
import { FixturePredictionsButton } from "@/app/components/FixturePredictionsButton";

type WinnerPick = "home" | "away" | "draw";

type Prediction = {
  winner: WinnerPick;
  homeScore: number;
  awayScore: number;
  etHomeScore?: number | null;
  etAwayScore?: number | null;
  penaltyWinner?: SidePick | null;
  penaltyHomeScore?: number | null;
  penaltyAwayScore?: number | null;
  updatedAt: number;
};

function predictionKey(matchKey: string) {
  return `wc:prediction:${matchKey}`;
}

function getMatchKey(m: FixtureMatch) {
  return `${m.dateLabel}|${m.time}|${m.home}|${m.away}|${m.stage ?? ""}|${m.group ?? ""}|${
    m.stadium ?? ""
  }`;
}

function parseScoreInput(raw: string): number {
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function scoreToInput(value: number | null | undefined) {
  if (value == null) return "";
  return value === 0 ? "" : String(value);
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

function readLocalPrediction(matchKey: string): Prediction | null {
  try {
    const raw = localStorage.getItem(predictionKey(matchKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Prediction;
    if (
      !parsed ||
      (parsed.winner !== "home" && parsed.winner !== "away" && parsed.winner !== "draw") ||
      !Number.isFinite(parsed.homeScore) ||
      !Number.isFinite(parsed.awayScore)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function FixtureCard({ match }: { match: FixtureMatch }) {
  const matchKey = useMemo(() => getMatchKey(match), [match]);
  const fixtureId = match.id ?? matchKey;
  const { user, ready } = useAuth();
  const isKnockout = isKnockoutStage(match.stage);
  const legacyKnockoutScoring = usesLegacyKnockoutScoring(match.knockoutScoringVersion);

  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [etWinner, setEtWinner] = useState<EtWinnerPick | null>(null);
  const [penaltyWinner, setPenaltyWinner] = useState<SidePick | null>(null);
  const [penaltyHomeScore, setPenaltyHomeScore] = useState("");
  const [penaltyAwayScore, setPenaltyAwayScore] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  function normalizeScoreInput(raw: string) {
    const digitsOnly = raw.replace(/[^\d]/g, "");
    if (digitsOnly.length === 0) return "";
    return digitsOnly.replace(/^0+(?=\d)/, "");
  }

  function applyPredictionToForm(next: Prediction | null) {
    if (!next) {
      setHomeScore("");
      setAwayScore("");
      setEtWinner(null);
      setPenaltyWinner(null);
      setPenaltyHomeScore("");
      setPenaltyAwayScore("");
      return;
    }

    setHomeScore(scoreToInput(next.homeScore));
    setAwayScore(scoreToInput(next.awayScore));
    setEtWinner(etWinnerFromScores(next.etHomeScore, next.etAwayScore));
    setPenaltyWinner(next.penaltyWinner ?? null);
    setPenaltyHomeScore(scoreToInput(next.penaltyHomeScore));
    setPenaltyAwayScore(scoreToInput(next.penaltyAwayScore));
  }

  useEffect(() => {
    const local = readLocalPrediction(matchKey);
    if (local) {
      setPrediction(local);
      applyPredictionToForm(local);
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
              et_home_score: number | null;
              et_away_score: number | null;
              penalty_winner: "home" | "away" | null;
              penalty_home_score: number | null;
              penalty_away_score: number | null;
              updated_at: string;
            } | null;
          }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) return;

      if (!json.prediction) {
        setPrediction(null);
        applyPredictionToForm(null);
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
        etHomeScore: data.et_home_score ?? null,
        etAwayScore: data.et_away_score ?? null,
        penaltyWinner:
          data.penalty_winner === "home" || data.penalty_winner === "away"
            ? data.penalty_winner
            : null,
        penaltyHomeScore: data.penalty_home_score ?? null,
        penaltyAwayScore: data.penalty_away_score ?? null,
        updatedAt: new Date(data.updated_at ?? Date.now()).getTime(),
      };
      setPrediction(next);
      applyPredictionToForm(next);
    }

    void loadFromDb();
  }, [fixtureId, user, matchKey]);

  useEffect(() => {
    if (!user) setServerError(null);
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

  const parsedHome = parseScoreInput(homeScore);
  const parsedAway = parseScoreInput(awayScore);
  const scoresEntered = homeScore !== "" && awayScore !== "";
  const hasValid90 =
    Number.isFinite(parsedHome) && Number.isFinite(parsedAway) && parsedHome >= 0 && parsedAway >= 0;
  const isDraw90 = scoresEntered && hasValid90 && isDrawScore(parsedHome, parsedAway);

  const penHomeNum = penaltyHomeScore === "" ? null : parseScoreInput(penaltyHomeScore);
  const penAwayNum = penaltyAwayScore === "" ? null : parseScoreInput(penaltyAwayScore);
  const penaltyBothEntered =
    penHomeNum != null &&
    penAwayNum != null &&
    Number.isFinite(penHomeNum) &&
    Number.isFinite(penAwayNum);
  const penaltyTied = penaltyBothEntered && penHomeNum === penAwayNum;
  const penaltyWinnerTeam = !penaltyBothEntered
    ? null
    : penHomeNum! > penAwayNum!
      ? match.home
      : penHomeNum! < penAwayNum!
        ? match.away
        : null;

  useEffect(() => {
    if (!isKnockout || !isDraw90) {
      setEtWinner(null);
      setPenaltyWinner(null);
      setPenaltyHomeScore("");
      setPenaltyAwayScore("");
      return;
    }
    if (legacyKnockoutScoring && etWinner !== "draw") {
      setPenaltyWinner(null);
    }
    if (!legacyKnockoutScoring) {
      setEtWinner(null);
    }
  }, [isDraw90, etWinner, isKnockout, legacyKnockoutScoring]);

  function buildKnockoutFields(home: number, away: number): {
    etWinner: EtWinnerPick | null;
    etHomeScore: number | null;
    etAwayScore: number | null;
    penaltyWinner: SidePick | null;
    penaltyHomeScore: number | null;
    penaltyAwayScore: number | null;
  } {
    if (!isKnockout || !isDrawScore(home, away)) {
      return {
        etWinner: null,
        etHomeScore: null,
        etAwayScore: null,
        penaltyWinner: null,
        penaltyHomeScore: null,
        penaltyAwayScore: null,
      };
    }

    if (!legacyKnockoutScoring) {
      const penHome = penaltyHomeScore === "" ? null : Number(penaltyHomeScore);
      const penAway = penaltyAwayScore === "" ? null : Number(penaltyAwayScore);
      const winner = penaltyWinnerFromScores(penHome, penAway);
      return {
        etWinner: null,
        etHomeScore: null,
        etAwayScore: null,
        penaltyWinner: winner,
        penaltyHomeScore: penHome,
        penaltyAwayScore: penAway,
      };
    }

    const pick = etWinner;
    if (pick !== "home" && pick !== "away" && pick !== "draw") {
      return {
        etWinner: null,
        etHomeScore: null,
        etAwayScore: null,
        penaltyWinner: null,
        penaltyHomeScore: null,
        penaltyAwayScore: null,
      };
    }

    const scores = etScoresFromWinner(pick);
    return {
      etWinner: pick,
      etHomeScore: scores.home,
      etAwayScore: scores.away,
      penaltyWinner: pick === "draw" ? penaltyWinner : null,
      penaltyHomeScore: null,
      penaltyAwayScore: null,
    };
  }

  function predictionSummary(next: Prediction) {
    if (!isKnockout) {
      return `${next.homeScore}-${next.awayScore}`;
    }
    return formatKnockoutPredictionSummary(
      {
        homeScore: next.homeScore,
        awayScore: next.awayScore,
        etWinner: etWinnerFromScores(next.etHomeScore, next.etAwayScore),
        penaltyWinner: next.penaltyWinner ?? null,
        penaltyHomeScore: next.penaltyHomeScore ?? null,
        penaltyAwayScore: next.penaltyAwayScore ?? null,
      },
      match.home,
      match.away,
      match.knockoutScoringVersion,
    );
  }

  async function save() {
    if (!user || !isPending || !predictionWindow.open) return;
    const hs = homeScore === "" ? 0 : Number(homeScore);
    const as = awayScore === "" ? 0 : Number(awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) return;

    const knockoutFields = buildKnockoutFields(Math.floor(hs), Math.floor(as));
    const validationError = validateKnockoutPrediction(isKnockout, match.knockoutScoringVersion, {
      homeScore: Math.floor(hs),
      awayScore: Math.floor(as),
      etWinner: knockoutFields.etWinner,
      penaltyWinner: knockoutFields.penaltyWinner,
      penaltyHomeScore: knockoutFields.penaltyHomeScore,
      penaltyAwayScore: knockoutFields.penaltyAwayScore,
    });
    if (validationError) {
      setServerError(validationError);
      return;
    }

    setServerError(null);
    setSaving(true);

    const derivedWinner: WinnerPick = hs === as ? "draw" : hs > as ? "home" : "away";
    const next: Prediction = {
      winner: derivedWinner,
      homeScore: Math.floor(hs),
      awayScore: Math.floor(as),
      etHomeScore: knockoutFields.etHomeScore,
      etAwayScore: knockoutFields.etAwayScore,
      penaltyWinner: knockoutFields.penaltyWinner,
      penaltyHomeScore: knockoutFields.penaltyHomeScore,
      penaltyAwayScore: knockoutFields.penaltyAwayScore,
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
        homeScore: next.homeScore,
        awayScore: next.awayScore,
        etWinner: knockoutFields.etWinner,
        penaltyWinner: knockoutFields.penaltyWinner,
        penaltyHomeScore: knockoutFields.penaltyHomeScore,
        penaltyAwayScore: knockoutFields.penaltyAwayScore,
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
      match.stage,
      {
        predictedEtHome: prediction.etHomeScore ?? null,
        predictedEtAway: prediction.etAwayScore ?? null,
        predictedPenaltyWinner: prediction.penaltyWinner ?? null,
        predictedPenaltyHome: prediction.penaltyHomeScore ?? null,
        predictedPenaltyAway: prediction.penaltyAwayScore ?? null,
        resultEtHome: match.resultEtHomeScore ?? null,
        resultEtAway: match.resultEtAwayScore ?? null,
        resultPenaltyWinner: match.resultPenaltyWinner ?? null,
        resultPenaltyHome: match.resultPenaltyHomeScore ?? null,
        resultPenaltyAway: match.resultPenaltyAwayScore ?? null,
        knockoutScoringVersion: match.knockoutScoringVersion ?? null,
      },
    );
  }, [
    hasResult,
    prediction,
    match.resultHomeScore,
    match.resultAwayScore,
    match.resultEtHomeScore,
    match.resultEtAwayScore,
    match.resultPenaltyWinner,
    match.resultPenaltyHomeScore,
    match.resultPenaltyAwayScore,
    match.knockoutScoringVersion,
    match.stage,
  ]);

  const finishedPenaltyDisplay = useMemo(() => {
    if (!hasResult || !isKnockout) return null;
    const rh = match.resultHomeScore!;
    const ra = match.resultAwayScore!;
    if (!isDrawScore(rh, ra)) return null;

    const penH = match.resultPenaltyHomeScore;
    const penA = match.resultPenaltyAwayScore;
    if (
      penH != null &&
      penA != null &&
      Number.isFinite(penH) &&
      Number.isFinite(penA) &&
      penH !== penA
    ) {
      return {
        penHome: penH,
        penAway: penA,
        summary: formatPenaltyShootoutResult(match.home, match.away, penH, penA),
      };
    }

    if (match.resultPenaltyWinner === "home" || match.resultPenaltyWinner === "away") {
      const winner = match.resultPenaltyWinner === "home" ? match.home : match.away;
      return { penHome: null, penAway: null, summary: `${winner} wins on penalties` };
    }

    if (
      legacyKnockoutScoring &&
      match.resultEtHomeScore != null &&
      match.resultEtAwayScore != null &&
      !isDrawScore(match.resultEtHomeScore, match.resultEtAwayScore)
    ) {
      return {
        penHome: null,
        penAway: null,
        summary: `Extra time: ${match.resultEtHomeScore}–${match.resultEtAwayScore}`,
      };
    }

    return null;
  }, [
    hasResult,
    isKnockout,
    legacyKnockoutScoring,
    match.away,
    match.home,
    match.resultAwayScore,
    match.resultEtAwayScore,
    match.resultEtHomeScore,
    match.resultHomeScore,
    match.resultPenaltyAwayScore,
    match.resultPenaltyHomeScore,
    match.resultPenaltyWinner,
  ]);

  const scoreInputClass =
    "h-10 w-14 rounded-lg border border-secondary-border bg-background px-1 text-center text-sm tabular-nums outline-none focus:border-secondary-300 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60";

  return (
    <div className="relative rounded-2xl border border-secondary-border bg-background p-5 shadow-sm sm:p-6">
      {isKnockout && match.stage ? (
        <div className="mb-3 flex justify-center sm:mb-4">
          <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700 ring-1 ring-primary-200 sm:text-[11px]">
            {match.stage}
          </span>
        </div>
      ) : null}

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
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center gap-4">
                    <span className="min-w-10 text-center text-2xl font-semibold tabular-nums text-primary-text">
                      {match.resultHomeScore}
                    </span>
                    <span className="text-sm font-medium text-gray-300">vs</span>
                    <span className="min-w-10 text-center text-2xl font-semibold tabular-nums text-primary-text">
                      {match.resultAwayScore}
                    </span>
                  </div>
                  <p className="text-xs font-medium uppercase tracking-wide text-secondary-text">
                    {finishedPenaltyDisplay ? "Full-time" : "Final score"}
                  </p>
                  {finishedPenaltyDisplay?.penHome != null &&
                  finishedPenaltyDisplay.penAway != null ? (
                    <div className="mt-1 flex flex-col items-center gap-1.5">
                      <div className="inline-flex items-center gap-3 rounded-xl bg-primary-50 px-4 py-2 ring-1 ring-primary-100">
                        <span className="text-sm" aria-hidden="true">
                          ⚽
                        </span>
                        <span className="min-w-8 text-center text-xl font-semibold tabular-nums text-primary-text">
                          {finishedPenaltyDisplay.penHome}
                        </span>
                        <span className="text-sm font-medium text-gray-300">–</span>
                        <span className="min-w-8 text-center text-xl font-semibold tabular-nums text-primary-text">
                          {finishedPenaltyDisplay.penAway}
                        </span>
                      </div>
                      <p className="text-xs font-medium uppercase tracking-wide text-secondary-text">
                        Penalties
                      </p>
                      {finishedPenaltyDisplay.summary ? (
                        <p className="text-center text-xs font-medium text-primary-700">
                          {finishedPenaltyDisplay.summary}
                        </p>
                      ) : null}
                    </div>
                  ) : finishedPenaltyDisplay?.summary ? (
                    <p className="mt-1 text-center text-xs font-medium text-primary-700">
                      {finishedPenaltyDisplay.summary}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-secondary-text">Final score not recorded</p>
              )}
              {prediction ? (
                <div className="flex max-w-sm flex-col items-center gap-1.5 text-center text-sm text-tertiary-700">
                  <span className="text-xs text-secondary-text">Your prediction</span>
                  <span className="inline-flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 rounded-md bg-primary-50 px-2 py-1 font-semibold leading-snug tabular-nums text-primary-700">
                    {predictionSummary(prediction)}
                  </span>
                  {earnedPoints != null ? (
                    <span
                      className={`inline-flex flex-wrap items-center justify-center gap-x-1 leading-snug ${predictionPointsClass(earnedPoints)}`}
                    >
                      {earnedPoints} {earnedPoints === 1 ? "point" : "points"}
                      <span className="font-normal text-secondary-text">
                        ({predictionPointsLabel(earnedPoints, match.stage, match.knockoutScoringVersion)})
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-sm text-tertiary-700">
                  <span>No prediction submitted</span>
                  <span className={predictionPointsClass(0)}>0 points</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex w-full max-w-xs flex-col items-center gap-4">
              <div className="flex w-full flex-col items-center gap-2">
                {isKnockout ? (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-secondary-text">
                    Full-time
                  </p>
                ) : null}
                <div className="flex items-center justify-center gap-4">
                  <input
                    inputMode="numeric"
                    value={homeScore}
                    onChange={(e) => setHomeScore(normalizeScoreInput(e.target.value))}
                    disabled={!canPredict}
                    className={scoreInputClass}
                    placeholder="0"
                    aria-label={`${match.home} score after 90 minutes`}
                  />
                  <span className="text-sm font-medium text-gray-300">vs</span>
                  <input
                    inputMode="numeric"
                    value={awayScore}
                    onChange={(e) => setAwayScore(normalizeScoreInput(e.target.value))}
                    disabled={!canPredict}
                    className={scoreInputClass}
                    placeholder="0"
                    aria-label={`${match.away} score after 90 minutes`}
                  />
                </div>
              </div>

              {isKnockout && isDraw90 && legacyKnockoutScoring ? (
                <div className="w-full rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-3">
                  <p className="text-center text-[11px] font-medium uppercase tracking-wide text-primary-700">
                    Extra time — pick a winner or draw
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      disabled={!canPredict}
                      onClick={() => setEtWinner("home")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        etWinner === "home"
                          ? "bg-primary-600 text-primary-foreground"
                          : "border border-secondary-border bg-background text-primary-text hover:bg-secondary-50"
                      }`}
                    >
                      {match.home}
                    </button>
                    <button
                      type="button"
                      disabled={!canPredict}
                      onClick={() => setEtWinner("draw")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        etWinner === "draw"
                          ? "bg-primary-600 text-primary-foreground"
                          : "border border-secondary-border bg-background text-primary-text hover:bg-secondary-50"
                      }`}
                    >
                      Draw
                    </button>
                    <button
                      type="button"
                      disabled={!canPredict}
                      onClick={() => setEtWinner("away")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        etWinner === "away"
                          ? "bg-primary-600 text-primary-foreground"
                          : "border border-secondary-border bg-background text-primary-text hover:bg-secondary-50"
                      }`}
                    >
                      {match.away}
                    </button>
                  </div>
                </div>
              ) : null}

              {isKnockout && isDraw90 && legacyKnockoutScoring && etWinner === "draw" ? (
                <div className="w-full rounded-xl border border-secondary-border bg-surface-blue-50 px-3 py-3">
                  <p className="text-center text-[11px] font-medium text-primary-text">
                    Penalties — pick a winner
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      disabled={!canPredict}
                      onClick={() => setPenaltyWinner("home")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        penaltyWinner === "home"
                          ? "bg-primary-600 text-primary-foreground"
                          : "border border-secondary-border bg-background text-primary-text hover:bg-secondary-50"
                      }`}
                    >
                      {match.home}
                    </button>
                    <button
                      type="button"
                      disabled={!canPredict}
                      onClick={() => setPenaltyWinner("away")}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        penaltyWinner === "away"
                          ? "bg-primary-600 text-primary-foreground"
                          : "border border-secondary-border bg-background text-primary-text hover:bg-secondary-50"
                      }`}
                    >
                      {match.away}
                    </button>
                  </div>
                </div>
              ) : null}

              {isKnockout && isDraw90 && !legacyKnockoutScoring ? (
                <div className="w-full rounded-2xl border border-primary-200 bg-linear-to-b from-primary-50/70 to-surface-blue-50 px-4 py-3.5 shadow-sm">
                  <div className="flex items-center justify-center gap-1.5">
                    <span aria-hidden="true" className="text-sm">
                      ⚽
                    </span>
                    <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                      Penalty shootout
                    </p>
                  </div>
             

                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <div className="flex min-w-0 flex-col items-center gap-1.5">
                      {/* <span className="flex items-center gap-1.5">
                        {flagUrlForTeam(match.home, 40) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={flagUrlForTeam(match.home, 40)!}
                            alt=""
                            width={18}
                            height={13}
                            className="h-[13px] w-[18px] shrink-0 rounded-[2px] ring-1 ring-secondary-border"
                            loading="lazy"
                          />
                        ) : null}
                        <span className="truncate text-[11px] font-medium text-primary-text">
                          {match.home}
                        </span>
                      </span> */}
                      <input
                        inputMode="numeric"
                        value={penaltyHomeScore}
                        onChange={(e) => setPenaltyHomeScore(normalizeScoreInput(e.target.value))}
                        disabled={!canPredict}
                        className={`${scoreInputClass} ${
                          penaltyTied ? "border-danger-300 focus:border-danger-400 focus:ring-danger-200/40" : ""
                        }`}
                        placeholder="0"
                        aria-label={`${match.home} penalty goals`}
                      />
                    </div>

                    <span className="pb-2.5 text-sm font-semibold text-gray-300">-</span>

                    <div className="flex min-w-0 flex-col items-center gap-1.5">
                      {/* <span className="flex items-center gap-1.5">
                        {flagUrlForTeam(match.away, 40) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={flagUrlForTeam(match.away, 40)!}
                            alt=""
                            width={18}
                            height={13}
                            className="h-[13px] w-[18px] shrink-0 rounded-[2px] ring-1 ring-secondary-border"
                            loading="lazy"
                          />
                        ) : null}
                        <span className="truncate text-[11px] font-medium text-primary-text">
                          {match.away}
                        </span>
                      </span> */}
                      <input
                        inputMode="numeric"
                        value={penaltyAwayScore}
                        onChange={(e) => setPenaltyAwayScore(normalizeScoreInput(e.target.value))}
                        disabled={!canPredict}
                        className={`${scoreInputClass} ${
                          penaltyTied ? "border-danger-300 focus:border-danger-400 focus:ring-danger-200/40" : ""
                        }`}
                        placeholder="0"
                        aria-label={`${match.away} penalty goals`}
                      />
                    </div>
                  </div>

                  {penaltyTied ? (
                    <p className="mt-2.5 text-center text-[11px] font-medium text-danger-600">
                      A shootout can&apos;t end level — pick a winning score.
                    </p>
                  ) : penaltyWinnerTeam ? (
                    <p className="mt-2.5 flex items-center justify-center gap-1 text-center text-[11px] font-medium text-primary-700">
                      <span aria-hidden="true">🏆</span>
                      {penaltyWinnerTeam} to win {Math.max(penHomeNum!, penAwayNum!)}-
                      {Math.min(penHomeNum!, penAwayNum!)} on penalties
                    </p>
                  ) : (
                    <p className="mt-2.5 text-center text-[11px] text-secondary-text">
                      Exact score = +3 pts · correct winner = +2 pts
                    </p>
                  )}
                </div>
              ) : null}
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
              <time dateTime={match.kickoffAt} className="font-normal text-primary-text">
                {kickoffTimeLabel}
              </time>
            ) : (
              <span className="font-normal text-primary-text">{kickoffTimeLabel}</span>
            )}
            {!isKnockout && match.stage ? <span>{match.stage}</span> : null}
            {match.group ? <span>{match.group}</span> : null}
          </div>

          {location ? <div className="mt-2 text-xs text-secondary-text">{location}</div> : null}

          {isPending && !predictionWindow.open && predictionWindow.reason ? (
            <div className="mt-2 text-xs text-secondary-text">{predictionWindow.reason}</div>
          ) : null}

          {prediction && !isFinished ? (
            <div className="mt-2 text-xs text-tertiary-700">
              Predicted:{" "}
              <span className="font-normal text-primary-text">{predictionSummary(prediction)}</span>
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
