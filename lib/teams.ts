export const KNOCKOUT_STAGES = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
] as const;

export function isKnockoutStage(stage: string | null | undefined) {
  if (!stage) return false;
  return (KNOCKOUT_STAGES as readonly string[]).includes(stage);
}

/** Knockout / group placeholders in fixture data — not real countries. */
export function isParticipantTeam(name: string) {
  const t = name.trim();
  if (!t) return false;
  if (/^W\d+$/i.test(t)) return false;
  if (/^RU\d+$/i.test(t)) return false;
  if (/^\d[A-L]$/i.test(t)) return false;
  if (/^2[A-L]$/i.test(t)) return false;
  if (/^3[A-Z]+$/i.test(t)) return false;
  return true;
}

export function sortTeams(teams: string[]) {
  return [...teams].sort((a, b) => a.localeCompare(b));
}

export function collectParticipantTeams(homeAwayPairs: { home: string; away: string }[]) {
  const set = new Set<string>();
  for (const row of homeAwayPairs) {
    if (isParticipantTeam(row.home)) set.add(row.home);
    if (isParticipantTeam(row.away)) set.add(row.away);
  }
  return sortTeams([...set]);
}
