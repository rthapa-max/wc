export type MatchOutcome = "home" | "away" | "draw";

export function outcomeFromScore(home: number, away: number): MatchOutcome {
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

/** Mirrors public.prediction_points in supabase.sql */
export function predictionPoints(
  predictedHome: number,
  predictedAway: number,
  resultHome: number,
  resultAway: number,
): number {
  if (resultHome === predictedHome && resultAway === predictedAway) return 3;

  const predictedOutcome = outcomeFromScore(predictedHome, predictedAway);
  const resultOutcome = outcomeFromScore(resultHome, resultAway);
  if (resultOutcome === predictedOutcome) return 2;

  return 1;
}

export function predictionPointsLabel(points: number) {
  if (points === 3) return "Exact score";
  if (points === 2) return "Correct winner";
  if (points === 1) return "Participated";
  return "No prediction";
}

export function predictionPointsClass(points: number) {
  if (points === 3) return "rounded-md bg-yellow-300 px-1.5 py-0.5 font-semibold text-brown-500";
  if (points === 2) return "rounded-md bg-primary-100 px-1.5 py-0.5 font-semibold text-primary-700";
  if (points === 1) return "rounded-md bg-secondary-50 px-1.5 py-0.5 font-semibold text-gray-700";
  return "font-semibold text-secondary-text";
}
