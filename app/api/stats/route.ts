import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import {
  aggregateTournamentTotals,
  aggregateUserStats,
  computeFunAwards,
  type PredictionPointRow,
} from "@/lib/predictionStats";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

async function requireUser() {
  const jar = await cookies();
  const token = jar.get(getSessionCookieName())?.value;
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
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

  const { data: users, error: usersError } = await supabase
    .from("app_users")
    .select("id,email,username,favorite_team")
    .limit(500);

  if (usersError) {
    return NextResponse.json({ ok: false, message: usersError.message }, { status: 500 });
  }

  const pointResult = await fetchAllRows<PredictionPointRow>((from, to) =>
    supabase
      .from("prediction_points")
      .select(
        "user_id,fixture_id,points,fixture_status,predicted_home_score,predicted_away_score,result_home_score,result_away_score,predicted_winner",
      )
      .range(from, to),
  );

  if (pointResult.error) {
    return NextResponse.json({ ok: false, message: pointResult.error }, { status: 500 });
  }

  const rows = aggregateUserStats(users ?? [], pointResult.data ?? []);
  const totals = aggregateTournamentTotals(rows);
  const { awards, facts } = computeFunAwards(rows, pointResult.data ?? []);

  return NextResponse.json({ ok: true, rows, totals, awards, facts });
}
