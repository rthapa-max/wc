import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/auth";
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
    .select("winner,home_score,away_score,updated_at")
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
        winner?: "home" | "away" | "draw";
        homeScore?: number;
        awayScore?: number;
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
    .select("status,date_label,time,city,kickoff_at,home,away")
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

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      fixture_id: fixtureId,
      winner,
      home_score: home,
      away_score: away,
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

