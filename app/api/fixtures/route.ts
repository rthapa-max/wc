import { NextResponse } from "next/server";
import { sortDateLabels } from "@/lib/fixtures";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const FIXTURE_COLUMNS =
  "id,date_label,time,home,away,stage,group,stadium,city,status,kickoff_at,result_home_score,result_away_score,result_et_home_score,result_et_away_score,result_penalty_winner,result_status";

export async function GET(req: Request) {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Server is not configured." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const datesOnly = searchParams.get("dates") === "1";
  const dateLabel = searchParams.get("date")?.trim();

  if (datesOnly) {
    const { data, error } = await supabase
      .from("fixtures")
      .select("date_label,kickoff_at")
      .order("kickoff_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    const seen = new Set<string>();
    const dates: string[] = [];
    for (const row of data ?? []) {
      const label = row.date_label as string;
      if (!label || seen.has(label)) continue;
      seen.add(label);
      dates.push(label);
    }

    return NextResponse.json({ ok: true, dates: sortDateLabels(dates) });
  }

  let query = supabase
    .from("fixtures")
    .select(FIXTURE_COLUMNS)
    .order("time", { ascending: true });

  if (dateLabel) {
    query = query.eq("date_label", dateLabel);
  } else {
    query = query.order("date_label", { ascending: true });
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, fixtures: data ?? [] });
}
