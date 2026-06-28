export type SidePick = "home" | "away";

export type EtWinnerPick = SidePick | "draw";

export type KnockoutPredictionFields = {
  homeScore: number;
  awayScore: number;
  etWinner: EtWinnerPick | null;
  penaltyWinner: SidePick | null;
};

export function isDrawScore(home: number, away: number) {
  return home === away;
}

/** Canonical scores stored in DB from an ET winner/draw pick. */
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
  fields: KnockoutPredictionFields,
): string | null {
  if (!isKnockout || !isDrawScore(fields.homeScore, fields.awayScore)) {
    return null;
  }

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

export function formatKnockoutPredictionSummary(
  fields: KnockoutPredictionFields,
  homeTeam: string,
  awayTeam: string,
): string {
  const base = `${fields.homeScore}-${fields.awayScore} (90 min)`;

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

export function knockoutExtrasLabels(
  homeScore: number,
  awayScore: number,
  etHome: number | null | undefined,
  etAway: number | null | undefined,
  penaltyWinner: SidePick | null | undefined,
  homeTeam: string,
  awayTeam: string,
): KnockoutExtrasLabels {
  if (!isDrawScore(homeScore, awayScore)) {
    return { et: null, penalties: null };
  }

  const etWinner = etWinnerFromScores(etHome, etAway);
  if (etWinner !== "home" && etWinner !== "away" && etWinner !== "draw") {
    return { et: null, penalties: null };
  }

  const et =
    etWinner === "draw" ? "Draw" : etWinner === "home" ? homeTeam : awayTeam;

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
): string | null {
  const { et, penalties } = knockoutExtrasLabels(
    homeScore,
    awayScore,
    etHome,
    etAway,
    penaltyWinner,
    homeTeam,
    awayTeam,
  );
  if (!et) return null;
  if (penalties) return `ET: ${et} · Pens: ${penalties}`;
  return `ET: ${et}`;
}
