export type KnockoutScoringVersion = "legacy" | "v2";

/** Finished knockout fixtures keep progressive 3/2/1 + ET scoring; upcoming use v2 rules. */
export function usesLegacyKnockoutScoring(version: string | null | undefined): boolean {
  return version === "legacy";
}

export function defaultKnockoutScoringVersion(
  version: string | null | undefined,
): KnockoutScoringVersion {
  return usesLegacyKnockoutScoring(version) ? "legacy" : "v2";
}
