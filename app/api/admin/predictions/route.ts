import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { savePrediction } from "@/lib/predictionSave";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { EtWinnerPick } from "@/lib/knockoutPrediction";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const fixtureId = url.searchParams.get("fixtureId")?.trim();
  const userId = url.searchParams.get("userId")?.trim();

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Server is not configured." },
      { status: 500 },
    );
  }

  if (fixtureId && userId) {
    const { data, error } = await supabase
      .from("predictions")
      .select(
        "home_score,away_score,et_home_score,et_away_score,penalty_winner,penalty_home_score,penalty_away_score,updated_at",
      )
      .eq("fixture_id", fixtureId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, prediction: data ?? null });
  }

  const [usersResult, fixturesResult] = await Promise.all([
    supabase
      .from("app_users")
      .select("id,email,username")
      .order("username", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from("fixtures")
      .select(
        "id,date_label,time,home,away,stage,status,knockout_scoring_version,kickoff_at",
      )
      .eq("status", "pending")
      .order("kickoff_at", { ascending: true }),
  ]);

  if (usersResult.error) {
    return NextResponse.json({ ok: false, message: usersResult.error.message }, { status: 500 });
  }
  if (fixturesResult.error) {
    return NextResponse.json({ ok: false, message: fixturesResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    users: usersResult.data ?? [],
    fixtures: fixturesResult.data ?? [],
  });
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | {
        userId?: string;
        fixtureId?: string;
        homeScore?: number;
        awayScore?: number;
        etWinner?: EtWinnerPick | null;
        penaltyWinner?: "home" | "away" | null;
        penaltyHomeScore?: number | null;
        penaltyAwayScore?: number | null;
      }
    | null;

  const userId = body?.userId?.trim();
  if (!userId) return NextResponse.json({ ok: false, message: "Missing userId" }, { status: 400 });
  if (!body?.fixtureId) return NextResponse.json({ ok: false, message: "Missing fixtureId" }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Server is not configured." },
      { status: 500 },
    );
  }

  const result = await savePrediction(
    supabase,
    {
      fixtureId: body.fixtureId,
      homeScore: Number(body.homeScore),
      awayScore: Number(body.awayScore),
      etWinner: body.etWinner,
      penaltyWinner: body.penaltyWinner,
      penaltyHomeScore: body.penaltyHomeScore,
      penaltyAwayScore: body.penaltyAwayScore,
    },
    { userId, bypassWindow: true },
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
