import { isKnockoutStage } from "@/lib/teams";
import type { SidePick } from "@/lib/knockoutPrediction";

export type MatchOutcome = "home" | "away" | "draw";

export type PredictionScoreInput = {
  predictedHome: number;
  predictedAway: number;
  predictedEtHome?: number | null;
  predictedEtAway?: number | null;
  predictedPenaltyWinner?: SidePick | null;
  resultHome: number;
  resultAway: number;
  resultEtHome?: number | null;
  resultEtAway?: number | null;
  resultPenaltyWinner?: SidePick | null;
  stage?: string | null;
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

/** Mirrors public.prediction_points_for() in supabase.sql */
export function computePredictionPoints(input: PredictionScoreInput): number {
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
    stage = null,
  } = input;

  if (!isKnockoutStage(stage)) {
    if (resultHome === predictedHome && resultAway === predictedAway) return 3;
    if (outcomesMatch(predictedHome, predictedAway, resultHome, resultAway)) return 2;
    return 1;
  }

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

/** Group-stage helper kept for simple call sites. */
export function predictionPoints(
  predictedHome: number,
  predictedAway: number,
  resultHome: number,
  resultAway: number,
  stage?: string | null,
  extras?: Omit<PredictionScoreInput, "predictedHome" | "predictedAway" | "resultHome" | "resultAway" | "stage">,
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

export function predictionPointsLabel(points: number, stage?: string | null) {
  if (isKnockoutStage(stage)) {
    if (points === 5) return "Through penalties";
    if (points === 4) return "Through extra time";
    if (points === 3) return "Exact 90 minutes";
    if (points === 2) return "Correct winner (90 min)";
    if (points === 1) return "Participated";
    return "No prediction";
  }

  if (points === 3) return "Exact score";
  if (points === 2) return "Correct winner";
  if (points === 1) return "Participated";
  return "No prediction";
}

export function predictionPointsClass(points: number) {
  if (points >= 5) return "rounded-md bg-yellow-300 px-1.5 py-0.5 font-semibold text-brown-500";
  if (points === 4) return "rounded-md bg-primary-200 px-1.5 py-0.5 font-semibold text-primary-800";
  if (points === 3) return "rounded-md bg-yellow-300 px-1.5 py-0.5 font-semibold text-brown-500";
  if (points === 2) return "rounded-md bg-primary-100 px-1.5 py-0.5 font-semibold text-primary-700";
  if (points === 1) return "rounded-md bg-secondary-50 px-1.5 py-0.5 font-semibold text-gray-700";
  return "font-semibold text-secondary-text";
}
