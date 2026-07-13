import {
  etScoresFromWinner,
  etWinnerFromScores,
  isDrawScore,
  penaltyWinnerFromScores,
  validateKnockoutPrediction,
  type EtWinnerPick,
} from "@/lib/knockoutPrediction";
import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";
import { getPredictionWindowState, kickoffMsFromFixtureRow } from "@/lib/kickoff";
import { outcomeFromScore } from "@/lib/scoring";
import { isKnockoutStage } from "@/lib/teams";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SavePredictionBody = {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  etWinner?: EtWinnerPick | null;
  etHomeScore?: number | null;
  etAwayScore?: number | null;
  penaltyWinner?: "home" | "away" | null;
  penaltyHomeScore?: number | null;
  penaltyAwayScore?: number | null;
};

export type SavePredictionOptions = {
  userId: string;
  /** Admin can save after the public prediction window has closed. */
  bypassWindow?: boolean;
};

export async function savePrediction(
  supabase: SupabaseClient,
  body: SavePredictionBody,
  options: SavePredictionOptions,
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  const fixtureId = body.fixtureId;
  const homeScore = Number(body.homeScore);
  const awayScore = Number(body.awayScore);

  if (!fixtureId) {
    return { ok: false, message: "Missing fixtureId", status: 400 };
  }
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
    return { ok: false, message: "Invalid score", status: 400 };
  }

  const home = Math.floor(homeScore);
  const away = Math.floor(awayScore);
  const winner = outcomeFromScore(home, away);

  let etHome: number | null = null;
  let etAway: number | null = null;
  let penaltyWinner: "home" | "away" | null = null;
  let penaltyHome: number | null = null;
  let penaltyAway: number | null = null;

  const etWinner = body.etWinner;
  if (etWinner === "home" || etWinner === "away" || etWinner === "draw") {
    const scores = etScoresFromWinner(etWinner);
    etHome = scores.home;
    etAway = scores.away;
  } else if (body.etHomeScore != null && body.etAwayScore != null) {
    etHome = Number(body.etHomeScore);
    etAway = Number(body.etAwayScore);
    if (!Number.isFinite(etHome) || !Number.isFinite(etAway) || etHome < 0 || etAway < 0) {
      return { ok: false, message: "Invalid extra time pick", status: 400 };
    }
    etHome = Math.floor(etHome);
    etAway = Math.floor(etAway);
  }

  if (body.penaltyWinner === "home" || body.penaltyWinner === "away") {
    penaltyWinner = body.penaltyWinner;
  }

  if (body.penaltyHomeScore != null && body.penaltyAwayScore != null) {
    penaltyHome = Number(body.penaltyHomeScore);
    penaltyAway = Number(body.penaltyAwayScore);
    if (
      !Number.isFinite(penaltyHome) ||
      !Number.isFinite(penaltyAway) ||
      penaltyHome < 0 ||
      penaltyAway < 0
    ) {
      return { ok: false, message: "Invalid penalty score", status: 400 };
    }
    penaltyHome = Math.floor(penaltyHome);
    penaltyAway = Math.floor(penaltyAway);
    penaltyWinner = penaltyWinnerFromScores(penaltyHome, penaltyAway);
  }

  const { data: fixture, error: fixtureErr } = await supabase
    .from("fixtures")
    .select("status,stage,date_label,time,city,kickoff_at,home,away,knockout_scoring_version")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureErr) return { ok: false, message: fixtureErr.message, status: 500 };
  if (!fixture) return { ok: false, message: "Fixture not found.", status: 404 };
  if (fixture.status === "finished") {
    return { ok: false, message: "Cannot add predictions for a finished match.", status: 403 };
  }
  if (fixture.status !== "pending") {
    return { ok: false, message: "Set the fixture status to pending before adding predictions.", status: 403 };
  }

  if (!options.bypassWindow) {
    const kickoffMs = fixture.kickoff_at
      ? new Date(fixture.kickoff_at).getTime()
      : kickoffMsFromFixtureRow(fixture);
    const window = getPredictionWindowState(kickoffMs);
    if (!window.open) {
      return {
        ok: false,
        message: window.reason ?? "Predictions are not open for this match.",
        status: 403,
      };
    }
  }

  const { data: targetUser, error: userErr } = await supabase
    .from("app_users")
    .select("id")
    .eq("id", options.userId)
    .maybeSingle();

  if (userErr) return { ok: false, message: userErr.message, status: 500 };
  if (!targetUser) return { ok: false, message: "User not found.", status: 404 };

  const isKnockout = isKnockoutStage(fixture.stage);
  const validationEtWinner: EtWinnerPick | null = etWinnerFromScores(etHome, etAway);

  const validationError = validateKnockoutPrediction(isKnockout, fixture.knockout_scoring_version, {
    homeScore: home,
    awayScore: away,
    etWinner: validationEtWinner,
    penaltyWinner,
    penaltyHomeScore: penaltyHome,
    penaltyAwayScore: penaltyAway,
  });
  if (validationError) {
    return { ok: false, message: validationError, status: 400 };
  }

  if (!isKnockout || !isDrawScore(home, away)) {
    etHome = null;
    etAway = null;
    penaltyWinner = null;
    penaltyHome = null;
    penaltyAway = null;
  } else if (usesLegacyKnockoutScoring(fixture.knockout_scoring_version)) {
    penaltyHome = null;
    penaltyAway = null;
    if (!isDrawScore(etHome ?? -1, etAway ?? -2)) {
      penaltyWinner = null;
    }
  } else {
    etHome = null;
    etAway = null;
  }

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: options.userId,
      fixture_id: fixtureId,
      winner,
      home_score: home,
      away_score: away,
      et_home_score: etHome,
      et_away_score: etAway,
      penalty_winner: penaltyWinner,
      penalty_home_score: penaltyHome,
      penalty_away_score: penaltyAway,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,fixture_id" },
  );

  if (error) return { ok: false, message: error.message, status: 500 };
  return { ok: true };
}
