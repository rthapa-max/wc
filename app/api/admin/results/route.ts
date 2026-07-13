import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { isDrawScore, penaltyWinnerFromScores } from "@/lib/knockoutPrediction";
import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | {
        fixtureId?: string;
        status?: "scheduled" | "pending";
        complete?: boolean;
        homeScore?: number | null;
        awayScore?: number | null;
        etHomeScore?: number | null;
        etAwayScore?: number | null;
        penaltyWinner?: "home" | "away" | null;
        penaltyHomeScore?: number | null;
        penaltyAwayScore?: number | null;
        updateTeams?: boolean;
        home?: string;
        away?: string;
      }
    | null;

  const fixtureId = body?.fixtureId;
  if (!fixtureId) return NextResponse.json({ ok: false, message: "Missing fixtureId" }, { status: 400 });

  const supabase = getSupabaseServerClient();

  if (body?.updateTeams) {
    const home = body.home?.trim();
    const away = body.away?.trim();
    if (!home || !away) {
      return NextResponse.json({ ok: false, message: "Both team names are required." }, { status: 400 });
    }

    const { data: fixture, error: fetchErr } = await supabase
      .from("fixtures")
      .select("status, stage")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ ok: false, message: fetchErr.message }, { status: 500 });
    if (!fixture) return NextResponse.json({ ok: false, message: "Fixture not found." }, { status: 404 });
    if (fixture.status === "finished") {
      return NextResponse.json({ ok: false, message: "Cannot change teams on a finished match." }, { status: 400 });
    }

    const knockoutStages = new Set([
      "Round of 32",
      "Round of 16",
      "Quarter-final",
      "Semi-final",
      "Final",
    ]);
    if (!fixture.stage || !knockoutStages.has(fixture.stage)) {
      return NextResponse.json(
        { ok: false, message: "Team names can only be updated for knockout fixtures." },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("fixtures").update({ home, away }).eq("id", fixtureId);
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, home, away });
  }

  if (body?.complete) {
    const homeScore = body.homeScore;
    const awayScore = body.awayScore;
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || (homeScore ?? 0) < 0 || (awayScore ?? 0) < 0) {
      return NextResponse.json({ ok: false, message: "Invalid score" }, { status: 400 });
    }

    const home = Math.floor(homeScore as number);
    const away = Math.floor(awayScore as number);

    const { data: fixture, error: fetchErr } = await supabase
      .from("fixtures")
      .select("stage,knockout_scoring_version")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ ok: false, message: fetchErr.message }, { status: 500 });
    if (!fixture) return NextResponse.json({ ok: false, message: "Fixture not found." }, { status: 404 });

    const knockoutStages = new Set([
      "Round of 32",
      "Round of 16",
      "Quarter-final",
      "Semi-final",
      "Final",
    ]);
    const isKnockout = fixture.stage != null && knockoutStages.has(fixture.stage);

    let resultEtHome: number | null = null;
    let resultEtAway: number | null = null;
    let resultPenaltyWinner: "home" | "away" | null = null;
    let resultPenaltyHome: number | null = null;
    let resultPenaltyAway: number | null = null;

    if (isKnockout && home === away) {
      if (usesLegacyKnockoutScoring(fixture.knockout_scoring_version)) {
        const etHome = body.etHomeScore;
        const etAway = body.etAwayScore;
        if (!Number.isFinite(etHome) || !Number.isFinite(etAway) || (etHome ?? 0) < 0 || (etAway ?? 0) < 0) {
          return NextResponse.json(
            { ok: false, message: "Enter extra time score when 90 minutes is a draw." },
            { status: 400 },
          );
        }
        resultEtHome = Math.floor(etHome as number);
        resultEtAway = Math.floor(etAway as number);

        if (resultEtHome === resultEtAway) {
          const pw = body.penaltyWinner;
          if (pw !== "home" && pw !== "away") {
            return NextResponse.json(
              { ok: false, message: "Pick the penalty shootout winner when extra time is a draw." },
              { status: 400 },
            );
          }
          resultPenaltyWinner = pw;
        }
      } else {
        const penHome = body.penaltyHomeScore;
        const penAway = body.penaltyAwayScore;
        if (
          !Number.isFinite(penHome) ||
          !Number.isFinite(penAway) ||
          (penHome ?? 0) < 0 ||
          (penAway ?? 0) < 0
        ) {
          return NextResponse.json(
            { ok: false, message: "Enter penalty shootout scores when 90 minutes is a draw." },
            { status: 400 },
          );
        }
        resultPenaltyHome = Math.floor(penHome as number);
        resultPenaltyAway = Math.floor(penAway as number);
        if (resultPenaltyHome === resultPenaltyAway) {
          return NextResponse.json(
            { ok: false, message: "Penalty shootout scores must have a winner." },
            { status: 400 },
          );
        }
        resultPenaltyWinner = penaltyWinnerFromScores(resultPenaltyHome, resultPenaltyAway);
      }
    }

    const { error } = await supabase
      .from("fixtures")
      .update({
        status: "finished",
        result_status: "finished",
        result_home_score: home,
        result_away_score: away,
        result_et_home_score: resultEtHome,
        result_et_away_score: resultEtAway,
        result_penalty_winner: resultPenaltyWinner,
        result_penalty_home_score: resultPenaltyHome,
        result_penalty_away_score: resultPenaltyAway,
        result_updated_at: new Date().toISOString(),
      })
      .eq("id", fixtureId);

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const status = body?.status;
  if (status !== "scheduled" && status !== "pending") {
    return NextResponse.json({ ok: false, message: "Invalid status" }, { status: 400 });
  }

  const { data: fixture, error: fetchErr } = await supabase
    .from("fixtures")
    .select("status")
    .eq("id", fixtureId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ ok: false, message: fetchErr.message }, { status: 500 });
  if (!fixture) return NextResponse.json({ ok: false, message: "Fixture not found." }, { status: 404 });
  if (fixture.status === "finished") {
    return NextResponse.json({ ok: false, message: "Cannot change status of a finished match." }, { status: 400 });
  }

  const { error } = await supabase
    .from("fixtures")
    .update({
      status,
      result_status: "scheduled",
    })
    .eq("id", fixtureId);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
