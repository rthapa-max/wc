import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import {
  etScoresFromWinner,
  etWinnerFromScores,
  isDrawScore,
  penaltyWinnerFromScores,
  validateKnockoutPrediction,
  type EtWinnerPick,
} from "@/lib/knockoutPrediction";
import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";
import { isKnockoutStage } from "@/lib/teams";
import { outcomeFromScore } from "@/lib/scoring";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getPredictionWindowState, kickoffMsFromFixtureRow } from "@/lib/kickoff";

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

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const fixtureId = url.searchParams.get("fixtureId");
  if (!fixtureId) return NextResponse.json({ ok: false, message: "Missing fixtureId" }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Server is not configured." },
      { status: 500 },
    );
  }
  const { data, error } = await supabase
    .from("predictions")
    .select(
      "winner,home_score,away_score,et_home_score,et_away_score,penalty_winner,penalty_home_score,penalty_away_score,updated_at",
    )
    .eq("user_id", user.id)
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, prediction: data ?? null });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | {
        fixtureId?: string;
        homeScore?: number;
        awayScore?: number;
        etWinner?: EtWinnerPick | null;
        etHomeScore?: number | null;
        etAwayScore?: number | null;
        penaltyWinner?: "home" | "away" | null;
        penaltyHomeScore?: number | null;
        penaltyAwayScore?: number | null;
      }
    | null;

  const fixtureId = body?.fixtureId;
  const homeScore = Number(body?.homeScore);
  const awayScore = Number(body?.awayScore);

  if (!fixtureId) return NextResponse.json({ ok: false, message: "Missing fixtureId" }, { status: 400 });
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0)
    return NextResponse.json({ ok: false, message: "Invalid score" }, { status: 400 });

  const home = Math.floor(homeScore);
  const away = Math.floor(awayScore);
  const winner = outcomeFromScore(home, away);

  let etHome: number | null = null;
  let etAway: number | null = null;
  let penaltyWinner: "home" | "away" | null = null;
  let penaltyHome: number | null = null;
  let penaltyAway: number | null = null;

  const etWinner = body?.etWinner;
  if (etWinner === "home" || etWinner === "away" || etWinner === "draw") {
    const scores = etScoresFromWinner(etWinner);
    etHome = scores.home;
    etAway = scores.away;
  } else if (body?.etHomeScore != null && body?.etAwayScore != null) {
    etHome = Number(body.etHomeScore);
    etAway = Number(body.etAwayScore);
    if (!Number.isFinite(etHome) || !Number.isFinite(etAway) || etHome < 0 || etAway < 0) {
      return NextResponse.json({ ok: false, message: "Invalid extra time pick" }, { status: 400 });
    }
    etHome = Math.floor(etHome);
    etAway = Math.floor(etAway);
  }

  if (body?.penaltyWinner === "home" || body?.penaltyWinner === "away") {
    penaltyWinner = body.penaltyWinner;
  }

  if (body?.penaltyHomeScore != null && body?.penaltyAwayScore != null) {
    penaltyHome = Number(body.penaltyHomeScore);
    penaltyAway = Number(body.penaltyAwayScore);
    if (
      !Number.isFinite(penaltyHome) ||
      !Number.isFinite(penaltyAway) ||
      penaltyHome < 0 ||
      penaltyAway < 0
    ) {
      return NextResponse.json({ ok: false, message: "Invalid penalty score" }, { status: 400 });
    }
    penaltyHome = Math.floor(penaltyHome);
    penaltyAway = Math.floor(penaltyAway);
    penaltyWinner = penaltyWinnerFromScores(penaltyHome, penaltyAway);
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
    .select("status,stage,date_label,time,city,kickoff_at,home,away,knockout_scoring_version")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fixtureErr) return NextResponse.json({ ok: false, message: fixtureErr.message }, { status: 500 });
  if (!fixture) return NextResponse.json({ ok: false, message: "Fixture not found." }, { status: 404 });
  if (fixture.status !== "pending") {
    return NextResponse.json({ ok: false, message: "Predictions are closed for this match." }, { status: 403 });
  }

  const kickoffMs = fixture.kickoff_at
    ? new Date(fixture.kickoff_at).getTime()
    : kickoffMsFromFixtureRow(fixture);
  const window = getPredictionWindowState(kickoffMs);
  if (!window.open) {
    return NextResponse.json(
      { ok: false, message: window.reason ?? "Predictions are not open for this match." },
      { status: 403 },
    );
  }

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
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 });
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
      user_id: user.id,
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

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const fixtureId = url.searchParams.get("fixtureId");
  if (!fixtureId) return NextResponse.json({ ok: false, message: "Missing fixtureId" }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Server is not configured." },
      { status: 500 },
    );
  }
  const { error } = await supabase
    .from("predictions")
    .delete()
    .eq("user_id", user.id)
    .eq("fixture_id", fixtureId);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
