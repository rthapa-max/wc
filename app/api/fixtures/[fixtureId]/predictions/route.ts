import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import { formatKnockoutExtrasLine } from "@/lib/knockoutPrediction";
import { predictionPoints, predictionPointsLabel } from "@/lib/scoring";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

async function requireUser() {
  const jar = await cookies();
  const token = jar.get(getSessionCookieName())?.value;
  if (!token) return null;
  try {
    const user = await verifySession(token);
    try {
      const supabase = getSupabaseServerClient();
      const { data } = await supabase.from("app_users").select("id").eq("id", user.id).maybeSingle();
      if (!data) {
        jar.set({
          name: getSessionCookieName(),
          value: "",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 0,
        });
        return null;
      }
    } catch {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function userDisplay(user: { username: string | null; email: string | null }) {
  if (user.username) return `@${user.username}`;
  return user.email ?? "Unknown user";
}

type RouteContext = { params: Promise<{ fixtureId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const { fixtureId } = await context.params;
  if (!fixtureId) {
    return NextResponse.json({ ok: false, message: "Missing fixture id." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Server is not configured." },
      { status: 500 },
    );
  }

  const { data: fixture, error: fixtureErr } = await supabase
    .from("fixtures")
    .select(
      "id,home,away,stage,status,knockout_scoring_version,result_home_score,result_away_score,result_et_home_score,result_et_away_score,result_penalty_winner,result_penalty_home_score,result_penalty_away_score",
    )
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureErr) {
    return NextResponse.json({ ok: false, message: fixtureErr.message }, { status: 500 });
  }
  if (!fixture) {
    return NextResponse.json({ ok: false, message: "Fixture not found." }, { status: 404 });
  }
  if (fixture.status !== "finished") {
    return NextResponse.json({ ok: false, message: "Predictions are visible after the match is finished." }, { status: 403 });
  }
  if (fixture.result_home_score == null || fixture.result_away_score == null) {
    return NextResponse.json({ ok: false, message: "Final score has not been recorded yet." }, { status: 403 });
  }

  const { data: predictions, error: predictionsErr } = await supabase
    .from("predictions")
    .select(
      "user_id,winner,home_score,away_score,et_home_score,et_away_score,penalty_winner,penalty_home_score,penalty_away_score",
    )
    .eq("fixture_id", fixtureId);

  if (predictionsErr) {
    return NextResponse.json({ ok: false, message: predictionsErr.message }, { status: 500 });
  }

  const rows = predictions ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const usersById = new Map<string, { username: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: users, error: usersErr } = await supabase
      .from("app_users")
      .select("id,username,email")
      .in("id", userIds);

    if (usersErr) {
      return NextResponse.json({ ok: false, message: usersErr.message }, { status: 500 });
    }

    for (const u of users ?? []) {
      usersById.set(u.id, { username: u.username, email: u.email });
    }
  }

  const list = rows
    .map((row) => {
      const profile = usersById.get(row.user_id);
      const points = predictionPoints(
        row.home_score,
        row.away_score,
        fixture.result_home_score,
        fixture.result_away_score,
        fixture.stage,
        {
          predictedEtHome: row.et_home_score,
          predictedEtAway: row.et_away_score,
          predictedPenaltyWinner:
            row.penalty_winner === "home" || row.penalty_winner === "away"
              ? row.penalty_winner
              : null,
          predictedPenaltyHome: row.penalty_home_score,
          predictedPenaltyAway: row.penalty_away_score,
          resultEtHome: fixture.result_et_home_score,
          resultEtAway: fixture.result_et_away_score,
          resultPenaltyWinner:
            fixture.result_penalty_winner === "home" || fixture.result_penalty_winner === "away"
              ? fixture.result_penalty_winner
              : null,
          resultPenaltyHome: fixture.result_penalty_home_score,
          resultPenaltyAway: fixture.result_penalty_away_score,
          knockoutScoringVersion: fixture.knockout_scoring_version,
        },
      );
      const knockoutExtras = formatKnockoutExtrasLine(
        row.home_score,
        row.away_score,
        row.et_home_score,
        row.et_away_score,
        row.penalty_winner === "home" || row.penalty_winner === "away"
          ? row.penalty_winner
          : null,
        fixture.home,
        fixture.away,
        fixture.knockout_scoring_version,
        row.penalty_home_score,
        row.penalty_away_score,
      );

      return {
        userId: row.user_id,
        displayName: profile ? userDisplay(profile) : "Unknown user",
        winner: row.winner,
        homeScore: row.home_score,
        awayScore: row.away_score,
        knockoutExtras,
        points,
        pointsLabel: predictionPointsLabel(points, fixture.stage, fixture.knockout_scoring_version),
      };
    })
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));

  return NextResponse.json({
    ok: true,
    fixture: {
      id: fixture.id,
      home: fixture.home,
      away: fixture.away,
      stage: fixture.stage,
      resultHomeScore: fixture.result_home_score,
      resultAwayScore: fixture.result_away_score,
      resultEtHomeScore: fixture.result_et_home_score,
      resultEtAwayScore: fixture.result_et_away_score,
      resultPenaltyWinner: fixture.result_penalty_winner,
      resultPenaltyHomeScore: fixture.result_penalty_home_score,
      resultPenaltyAwayScore: fixture.result_penalty_away_score,
    },
    predictions: list,
  });
}
