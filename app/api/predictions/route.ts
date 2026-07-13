import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import type { EtWinnerPick } from "@/lib/knockoutPrediction";
import { savePrediction } from "@/lib/predictionSave";
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

  const result = await savePrediction(
    supabase,
    {
      fixtureId,
      homeScore: Number(body?.homeScore),
      awayScore: Number(body?.awayScore),
      etWinner: body?.etWinner,
      etHomeScore: body?.etHomeScore,
      etAwayScore: body?.etAwayScore,
      penaltyWinner: body?.penaltyWinner,
      penaltyHomeScore: body?.penaltyHomeScore,
      penaltyAwayScore: body?.penaltyAwayScore,
    },
    { userId: user.id },
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  }

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
