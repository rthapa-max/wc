import { knockoutExtrasLabels } from "@/lib/knockoutPrediction";
import { PREDICTION_CLOSES_BEFORE_MS } from "@/lib/kickoff";
import { sendPredictionWindowClosedEmail } from "@/lib/resend";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type FixtureRow = {
  id: string;
  home: string;
  away: string;
  date_label: string;
  time: string;
  city: string | null;
  kickoff_at: string;
  status: string;
  stage: string | null;
  knockout_scoring_version: "legacy" | "v2" | null;
};

type PredictionRow = {
  home_score: number;
  away_score: number;
  et_home_score: number | null;
  et_away_score: number | null;
  penalty_winner: "home" | "away" | null;
  penalty_home_score: number | null;
  penalty_away_score: number | null;
  winner: "home" | "away" | "draw";
  user_id: string;
};

type UserRow = {
  id: string;
  email: string | null;
  username: string | null;
};

function userDisplay(user: UserRow) {
  if (user.username) return `@${user.username}`;
  return user.email ?? "Unknown user";
}

function winnerLabel(home: string, away: string, winner: PredictionRow["winner"]) {
  if (winner === "draw") return "Draw";
  if (winner === "home") return home;
  return away;
}

/**
 * Hourly cron: for each upcoming match whose prediction window has closed
 * (1 hour before Nepal-time kickoff) and we have not emailed yet, send all
 * user predictions to the notify list.
 */
export async function processPredictionWindowClosures(nowMs = Date.now()) {
  const supabase = getSupabaseServerClient();
  const nowIso = new Date(nowMs).toISOString();

  const { data: fixtures, error: fixturesErr } = await supabase
    .from("fixtures")
    .select("id,home,away,date_label,time,city,kickoff_at,status,stage,knockout_scoring_version")
    .is("prediction_close_notified_at", null)
    .not("kickoff_at", "is", null)
    .gt("kickoff_at", nowIso)
    .in("status", ["scheduled", "pending"]);

  if (fixturesErr) throw new Error(fixturesErr.message);

  const candidates = (fixtures ?? []) as FixtureRow[];
  const results: {
    fixtureId: string;
    sent: boolean;
    reason?: string;
    predictionCount?: number;
  }[] = [];

  console.log("[prediction-close] scan", {
    now: nowIso,
    candidateCount: candidates.length,
    fixtureIds: candidates.map((f) => f.id),
  });

  for (const fixture of candidates) {
    const kickoffMs = new Date(fixture.kickoff_at).getTime();
    const closesAt = kickoffMs - PREDICTION_CLOSES_BEFORE_MS;

    if (nowMs < closesAt) {
      results.push({
        fixtureId: fixture.id,
        sent: false,
        reason: "prediction window still open",
      });
      continue;
    }

    if (nowMs >= kickoffMs) {
      results.push({
        fixtureId: fixture.id,
        sent: false,
        reason: "match already started",
      });
      continue;
    }

    const { data: predictions, error: predErr } = await supabase
      .from("predictions")
      .select(
        "home_score,away_score,et_home_score,et_away_score,penalty_winner,penalty_home_score,penalty_away_score,winner,user_id",
      )
      .eq("fixture_id", fixture.id);

    if (predErr) {
      results.push({ fixtureId: fixture.id, sent: false, reason: predErr.message });
      continue;
    }

    const predRows = (predictions ?? []) as PredictionRow[];
    const userIds = [...new Set(predRows.map((p) => p.user_id))];

    const usersById = new Map<string, UserRow>();
    if (userIds.length > 0) {
      const { data: users, error: usersErr } = await supabase
        .from("app_users")
        .select("id,email,username")
        .in("id", userIds);

      if (usersErr) {
        results.push({ fixtureId: fixture.id, sent: false, reason: usersErr.message });
        continue;
      }

      for (const user of (users ?? []) as UserRow[]) {
        usersById.set(user.id, user);
      }
    }

    try {
      console.log("[prediction-close] emailing fixture", {
        fixtureId: fixture.id,
        match: `${fixture.home} vs ${fixture.away}`,
        kickoffAt: fixture.kickoff_at,
        closesAt: new Date(closesAt).toISOString(),
        predictionCount: predRows.length,
      });

      await sendPredictionWindowClosedEmail({
        home: fixture.home,
        away: fixture.away,
        dateLabel: fixture.date_label,
        time: fixture.time,
        city: fixture.city,
        closedAt: new Date(closesAt).toISOString(),
        stage: fixture.stage,
        knockoutScoringVersion: fixture.knockout_scoring_version,
        predictions: predRows.map((p) => {
          const user = usersById.get(p.user_id);
          const { et, penalties } = knockoutExtrasLabels(
            p.home_score,
            p.away_score,
            p.et_home_score,
            p.et_away_score,
            p.penalty_winner === "home" || p.penalty_winner === "away"
              ? p.penalty_winner
              : null,
            p.penalty_home_score,
            p.penalty_away_score,
            fixture.home,
            fixture.away,
            fixture.knockout_scoring_version,
          );
          return {
            userDisplay: user ? userDisplay(user) : "Unknown user",
            homeScore: p.home_score,
            awayScore: p.away_score,
            winner: winnerLabel(fixture.home, fixture.away, p.winner),
            extraTime: et,
            penalties,
            penaltyHomeScore: p.penalty_home_score,
            penaltyAwayScore: p.penalty_away_score,
          };
        }),
      });

      console.log("[prediction-close] email ok", {
        fixtureId: fixture.id,
        match: `${fixture.home} vs ${fixture.away}`,
        predictionCount: predRows.length,
      });
    } catch (emailErr) {
      const message = emailErr instanceof Error ? emailErr.message : "Failed to send email";
      console.error("[prediction-close] email failed", {
        fixtureId: fixture.id,
        match: `${fixture.home} vs ${fixture.away}`,
        message,
        error: emailErr,
      });
      results.push({ fixtureId: fixture.id, sent: false, reason: message });
      continue;
    }

    const { error: markErr } = await supabase
      .from("fixtures")
      .update({ prediction_close_notified_at: new Date().toISOString() })
      .eq("id", fixture.id)
      .is("prediction_close_notified_at", null);

    if (markErr) {
      results.push({ fixtureId: fixture.id, sent: false, reason: markErr.message });
      continue;
    }

    results.push({
      fixtureId: fixture.id,
      sent: true,
      predictionCount: predRows.length,
    });
  }

  return {
    checked: candidates.length,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent).length,
    results,
  };
}
