import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";

export type SidePick = "home" | "away";

export type EtWinnerPick = SidePick | "draw";

export type KnockoutPredictionFields = {
  homeScore: number;
  awayScore: number;
  etWinner: EtWinnerPick | null;
  penaltyWinner: SidePick | null;
  penaltyHomeScore?: number | null;
  penaltyAwayScore?: number | null;
};

export function isDrawScore(home: number, away: number) {
  return home === away;
}

export function penaltyWinnerFromScores(
  home: number | null | undefined,
  away: number | null | undefined,
): SidePick | null {
  if (home == null || away == null || home === away) return null;
  return home > away ? "home" : "away";
}

/** Canonical scores stored in DB from an ET winner/draw pick (legacy scoring only). */
export function etScoresFromWinner(pick: EtWinnerPick): { home: number; away: number } {
  if (pick === "home") return { home: 1, away: 0 };
  if (pick === "away") return { home: 0, away: 1 };
  return { home: 1, away: 1 };
}

export function etWinnerFromScores(
  home: number | null | undefined,
  away: number | null | undefined,
): EtWinnerPick | null {
  if (home == null || away == null) return null;
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export function validateKnockoutPrediction(
  isKnockout: boolean,
  knockoutScoringVersion: string | null | undefined,
  fields: KnockoutPredictionFields,
): string | null {
  if (!isKnockout || !isDrawScore(fields.homeScore, fields.awayScore)) {
    return null;
  }

  if (usesLegacyKnockoutScoring(knockoutScoringVersion)) {
    if (fields.etWinner !== "home" && fields.etWinner !== "away" && fields.etWinner !== "draw") {
      return "Pick who wins in extra time (or draw) when you predict a draw after 90 minutes.";
    }

    if (
      fields.etWinner === "draw" &&
      fields.penaltyWinner !== "home" &&
      fields.penaltyWinner !== "away"
    ) {
      return "Pick who wins on penalties when extra time is also a draw.";
    }

    return null;
  }

  const penHome = fields.penaltyHomeScore;
  const penAway = fields.penaltyAwayScore;
  if (penHome == null || penAway == null || !Number.isFinite(penHome) || !Number.isFinite(penAway)) {
    return "Enter the penalty shootout score when you predict a draw after 90 minutes.";
  }
  if (penHome < 0 || penAway < 0) {
    return "Penalty scores must be zero or greater.";
  }
  if (penHome === penAway) {
    return "Penalty shootout scores must have a winner (they cannot be tied).";
  }

  return null;
}

export function formatKnockoutPredictionSummary(
  fields: KnockoutPredictionFields,
  homeTeam: string,
  awayTeam: string,
  knockoutScoringVersion?: string | null,
): string {
  const base = `${fields.homeScore}-${fields.awayScore} (full-time)`;

  if (!usesLegacyKnockoutScoring(knockoutScoringVersion)) {
    if (!isDrawScore(fields.homeScore, fields.awayScore)) {
      return base.replace(" (full-time)", "");
    }

    const penHome = fields.penaltyHomeScore;
    const penAway = fields.penaltyAwayScore;
    if (penHome != null && penAway != null && penHome !== penAway) {
      const winner =
        penHome > penAway
          ? `${homeTeam} ${penHome}-${penAway}`
          : `${awayTeam} ${penAway}-${penHome}`;
      return `${base} · Pens: ${winner}`;
    }

    return base;
  }

  if (fields.etWinner !== "home" && fields.etWinner !== "away" && fields.etWinner !== "draw") {
    return base;
  }

  const etLabel =
    fields.etWinner === "draw"
      ? "Draw (ET)"
      : fields.etWinner === "home"
        ? `${homeTeam} (ET)`
        : `${awayTeam} (ET)`;

  if (
    fields.etWinner === "draw" &&
    (fields.penaltyWinner === "home" || fields.penaltyWinner === "away")
  ) {
    const pens = fields.penaltyWinner === "home" ? homeTeam : awayTeam;
    return `${base} · ${etLabel} · Pens: ${pens}`;
  }

  return `${base} · ${etLabel}`;
}

export type KnockoutExtrasLabels = {
  et: string | null;
  penalties: string | null;
};

export function formatPenaltyShootoutResult(
  homeTeam: string,
  awayTeam: string,
  penHome: number | null | undefined,
  penAway: number | null | undefined,
): string | null {
  if (penHome == null || penAway == null || penHome === penAway) return null;
  const winner = penHome > penAway ? homeTeam : awayTeam;
  return `${penHome}–${penAway} (${winner} wins)`;
}

export function knockoutExtrasLabels(
  homeScore: number,
  awayScore: number,
  etHome: number | null | undefined,
  etAway: number | null | undefined,
  penaltyWinner: SidePick | null | undefined,
  penaltyHomeScore: number | null | undefined,
  penaltyAwayScore: number | null | undefined,
  homeTeam: string,
  awayTeam: string,
  knockoutScoringVersion?: string | null,
): KnockoutExtrasLabels {
  if (!isDrawScore(homeScore, awayScore)) {
    return { et: null, penalties: null };
  }

  if (!usesLegacyKnockoutScoring(knockoutScoringVersion)) {
    const pens = formatPenaltyShootoutResult(
      homeTeam,
      awayTeam,
      penaltyHomeScore,
      penaltyAwayScore,
    );
    return { et: null, penalties: pens };
  }

  const etWinner = etWinnerFromScores(etHome, etAway);
  if (etWinner !== "home" && etWinner !== "away" && etWinner !== "draw") {
    return { et: null, penalties: null };
  }

  const et = etWinner === "draw" ? "Draw" : etWinner === "home" ? homeTeam : awayTeam;

  const penalties =
    etWinner === "draw" && (penaltyWinner === "home" || penaltyWinner === "away")
      ? penaltyWinner === "home"
        ? homeTeam
        : awayTeam
      : null;

  return { et, penalties };
}

export function formatKnockoutExtrasLine(
  homeScore: number,
  awayScore: number,
  etHome: number | null | undefined,
  etAway: number | null | undefined,
  penaltyWinner: SidePick | null | undefined,
  homeTeam: string,
  awayTeam: string,
  knockoutScoringVersion?: string | null,
  penaltyHomeScore?: number | null,
  penaltyAwayScore?: number | null,
): string | null {
  const { et, penalties } = knockoutExtrasLabels(
    homeScore,
    awayScore,
    etHome,
    etAway,
    penaltyWinner,
    penaltyHomeScore,
    penaltyAwayScore,
    homeTeam,
    awayTeam,
    knockoutScoringVersion,
  );
  if (!et && !penalties) return null;
  if (penalties && !et) return `Pens: ${penalties}`;
  if (et && penalties) return `ET: ${et} · Pens: ${penalties}`;
  return `ET: ${et}`;
}
