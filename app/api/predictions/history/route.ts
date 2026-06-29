import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/auth";
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

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

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
      "fixture_id,winner,home_score,away_score,et_home_score,et_away_score,penalty_winner,penalty_home_score,penalty_away_score,updated_at,fixtures:fixture_id(home,away,date_label,time,stage,knockout_scoring_version)",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, predictions: data ?? [] });
}

