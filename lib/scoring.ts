import { isKnockoutStage } from "@/lib/teams";
import { isDrawScore } from "@/lib/knockoutPrediction";
import type { SidePick } from "@/lib/knockoutPrediction";
import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";

export type MatchOutcome = "home" | "away" | "draw";

export type PredictionScoreInput = {
  predictedHome: number;
  predictedAway: number;
  predictedEtHome?: number | null;
  predictedEtAway?: number | null;
  predictedPenaltyWinner?: SidePick | null;
  predictedPenaltyHome?: number | null;
  predictedPenaltyAway?: number | null;
  resultHome: number;
  resultAway: number;
  resultEtHome?: number | null;
  resultEtAway?: number | null;
  resultPenaltyWinner?: SidePick | null;
  resultPenaltyHome?: number | null;
  resultPenaltyAway?: number | null;
  stage?: string | null;
  knockoutScoringVersion?: string | null;
};

export function outcomeFromScore(home: number, away: number): MatchOutcome {
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

function outcomesMatch(
  predictedHome: number,
  predictedAway: number,
  resultHome: number,
  resultAway: number,
): boolean {
  return outcomeFromScore(predictedHome, predictedAway) === outcomeFromScore(resultHome, resultAway);
}

function penaltyWinnerFromScores(
  home: number | null | undefined,
  away: number | null | undefined,
): SidePick | null {
  if (home == null || away == null || home === away) return null;
  return home > away ? "home" : "away";
}

function resolvePenaltyWinner(
  winner: SidePick | null | undefined,
  home: number | null | undefined,
  away: number | null | undefined,
): SidePick | null {
  if (winner === "home" || winner === "away") return winner;
  return penaltyWinnerFromScores(home, away);
}

/** Progressive knockout scoring (3/2/1 + ET + pens) for the one finished legacy fixture. */
function computeLegacyKnockoutPoints(input: PredictionScoreInput): number {
  const {
    predictedHome,
    predictedAway,
    predictedEtHome = null,
    predictedEtAway = null,
    predictedPenaltyWinner = null,
    resultHome,
    resultAway,
    resultEtHome = null,
    resultEtAway = null,
    resultPenaltyWinner = null,
  } = input;

  if (resultHome !== predictedHome || resultAway !== predictedAway) {
    if (outcomesMatch(predictedHome, predictedAway, resultHome, resultAway)) return 2;
    return 1;
  }

  let points = 3;

  if (resultHome !== resultAway) {
    return points;
  }

  if (predictedEtHome == null || predictedEtAway == null) return points;
  if (resultEtHome == null || resultEtAway == null) return points;

  if (!outcomesMatch(predictedEtHome, predictedEtAway, resultEtHome, resultEtAway)) {
    return points;
  }

  points += 1;

  if (resultEtHome !== resultEtAway) {
    return points;
  }

  if (resultPenaltyWinner !== "home" && resultPenaltyWinner !== "away") return points;
  if (predictedPenaltyWinner !== "home" && predictedPenaltyWinner !== "away") return points;
  if (predictedPenaltyWinner === resultPenaltyWinner) {
    points += 1;
  }

  return points;
}

/** Knockout v2: 5/3/0 regular time + up to 3 penalty points (no participation). */
function computeKnockoutV2Points(input: PredictionScoreInput): number {
  const {
    predictedHome,
    predictedAway,
    predictedPenaltyWinner = null,
    predictedPenaltyHome = null,
    predictedPenaltyAway = null,
    resultHome,
    resultAway,
    resultPenaltyWinner = null,
    resultPenaltyHome = null,
    resultPenaltyAway = null,
  } = input;

  let points: number;
  if (resultHome === predictedHome && resultAway === predictedAway) {
    points = 5;
  } else if (outcomesMatch(predictedHome, predictedAway, resultHome, resultAway)) {
    points = 3;
  } else {
    return 0;
  }

  if (resultHome !== resultAway) {
    return points;
  }

  if (!isDrawScore(predictedHome, predictedAway)) {
    return points;
  }

  const actualPenWinner = resolvePenaltyWinner(
    resultPenaltyWinner,
    resultPenaltyHome,
    resultPenaltyAway,
  );
  if (actualPenWinner !== "home" && actualPenWinner !== "away") {
    return points;
  }

  const predictedPenWinner = resolvePenaltyWinner(
    predictedPenaltyWinner,
    predictedPenaltyHome,
    predictedPenaltyAway,
  );
  if (predictedPenWinner !== "home" && predictedPenWinner !== "away") {
    return points;
  }

  const hasExactPenaltyScores =
    predictedPenaltyHome != null &&
    predictedPenaltyAway != null &&
    resultPenaltyHome != null &&
    resultPenaltyAway != null;

  if (
    hasExactPenaltyScores &&
    predictedPenaltyHome === resultPenaltyHome &&
    predictedPenaltyAway === resultPenaltyAway
  ) {
    return points + 3;
  }

  if (predictedPenWinner === actualPenWinner) {
    return points + 2;
  }

  return points;
}

/** Mirrors public.prediction_points_for() in supabase.sql */
export function computePredictionPoints(input: PredictionScoreInput): number {
  const { stage = null, knockoutScoringVersion = null, ...rest } = input;

  if (!isKnockoutStage(stage)) {
    const { predictedHome, predictedAway, resultHome, resultAway } = rest;
    if (resultHome === predictedHome && resultAway === predictedAway) return 3;
    if (outcomesMatch(predictedHome, predictedAway, resultHome, resultAway)) return 2;
    return 1;
  }

  if (usesLegacyKnockoutScoring(knockoutScoringVersion)) {
    return computeLegacyKnockoutPoints(rest);
  }

  return computeKnockoutV2Points(rest);
}

/** Group-stage helper kept for simple call sites. */
export function predictionPoints(
  predictedHome: number,
  predictedAway: number,
  resultHome: number,
  resultAway: number,
  stage?: string | null,
  extras?: Omit<
    PredictionScoreInput,
    "predictedHome" | "predictedAway" | "resultHome" | "resultAway" | "stage"
  >,
): number {
  return computePredictionPoints({
    predictedHome,
    predictedAway,
    resultHome,
    resultAway,
    stage,
    ...extras,
  });
}

export function predictionPointsLabel(
  points: number,
  stage?: string | null,
  knockoutScoringVersion?: string | null,
) {
  if (isKnockoutStage(stage) && usesLegacyKnockoutScoring(knockoutScoringVersion)) {
    if (points === 5) return "Through penalties";
    if (points === 4) return "Through extra time";
    if (points === 3) return "Full-time";
    if (points === 2) return "Correct winner (full-time)";
    if (points === 1) return "Participated";
    return "No prediction";
  }

  if (isKnockoutStage(stage)) {
    if (points >= 8) return "Exact score + penalties";
    if (points === 6) return "Draw + exact penalties";
    if (points === 5) return "Exact score or draw + penalties";
    if (points === 3) return "Correct outcome";
    if (points === 0) return "No points";
    return `${points} points`;
  }

  if (points === 3) return "Exact score";
  if (points === 2) return "Correct winner";
  if (points === 1) return "Participated";
  return "No prediction";
}

export function predictionPointsClass(points: number) {
  if (points >= 8) return "rounded-md bg-yellow-300 px-1.5 py-0.5 font-semibold text-brown-500";
  if (points >= 6) return "rounded-md bg-primary-200 px-1.5 py-0.5 font-semibold text-primary-800";
  if (points === 5) return "rounded-md bg-yellow-300 px-1.5 py-0.5 font-semibold text-brown-500";
  if (points === 4) return "rounded-md bg-primary-200 px-1.5 py-0.5 font-semibold text-primary-800";
  if (points === 3) return "rounded-md bg-yellow-300 px-1.5 py-0.5 font-semibold text-brown-500";
  if (points === 2) return "rounded-md bg-primary-100 px-1.5 py-0.5 font-semibold text-primary-700";
  if (points === 1) return "rounded-md bg-secondary-50 px-1.5 py-0.5 font-semibold text-gray-700";
  return "font-semibold text-secondary-text";
}
