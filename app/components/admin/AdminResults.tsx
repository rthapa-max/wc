"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { compareByDateAndTime } from "@/lib/fixtures";
import { isDrawScore } from "@/lib/knockoutPrediction";
import { isKnockoutStage } from "@/lib/teams";

type FixtureRow = {
  id: string;
  date_label: string;
  time: string;
  home: string;
  away: string;
  stage: string | null;
  status: "scheduled" | "pending" | "finished";
  result_home_score: number | null;
  result_away_score: number | null;
  result_et_home_score: number | null;
  result_et_away_score: number | null;
  result_penalty_winner: "home" | "away" | null;
};

function normalizeScore(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "");
}

function parseScoreInput(raw: string): number {
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function AdminResultRow({
  row,
  busy,
  teamOptions,
  onSaveStatus,
  onSaveTeams,
  onComplete,
}: {
  row: FixtureRow;
  busy: boolean;
  teamOptions: string[];
  onSaveStatus: (args: { id: string; status: "scheduled" | "pending" }) => void;
  onSaveTeams: (args: { id: string; home: string; away: string }) => void;
  onComplete: (args: {
    id: string;
    hs: string;
    as: string;
    etHs: string;
    etAs: string;
    penaltyWinner: "home" | "away" | null;
  }) => void;
}) {
  const isFinished = row.status === "finished";
  const isKnockout = isKnockoutStage(row.stage);
  const canEditTeams = isKnockout && !isFinished;
  const [hs, setHs] = useState(row.result_home_score === null ? "" : String(row.result_home_score));
  const [as, setAs] = useState(row.result_away_score === null ? "" : String(row.result_away_score));
  const [etHs, setEtHs] = useState(
    row.result_et_home_score === null ? "" : String(row.result_et_home_score),
  );
  const [etAs, setEtAs] = useState(
    row.result_et_away_score === null ? "" : String(row.result_et_away_score),
  );
  const [penaltyWinner, setPenaltyWinner] = useState<"home" | "away" | null>(
    row.result_penalty_winner ?? null,
  );
  const [homeTeam, setHomeTeam] = useState(row.home);
  const [awayTeam, setAwayTeam] = useState(row.away);
  const [status, setStatus] = useState<"scheduled" | "pending">(
    row.status === "pending" ? "pending" : "scheduled",
  );

  useEffect(() => {
    setHs(row.result_home_score === null ? "" : String(row.result_home_score));
    setAs(row.result_away_score === null ? "" : String(row.result_away_score));
    setEtHs(row.result_et_home_score === null ? "" : String(row.result_et_home_score));
    setEtAs(row.result_et_away_score === null ? "" : String(row.result_et_away_score));
    setPenaltyWinner(row.result_penalty_winner ?? null);
    setHomeTeam(row.home);
    setAwayTeam(row.away);
    setStatus(row.status === "pending" ? "pending" : "scheduled");
  }, [
    row.id,
    row.away,
    row.home,
    row.result_away_score,
    row.result_et_away_score,
    row.result_et_home_score,
    row.result_home_score,
    row.result_penalty_winner,
    row.status,
  ]);

  const teamsDirty = homeTeam.trim() !== row.home || awayTeam.trim() !== row.away;
  const savedHs = row.result_home_score === null ? "" : String(row.result_home_score);
  const savedAs = row.result_away_score === null ? "" : String(row.result_away_score);
  const savedEtHs = row.result_et_home_score === null ? "" : String(row.result_et_home_score);
  const savedEtAs = row.result_et_away_score === null ? "" : String(row.result_et_away_score);
  const parsedHs = parseScoreInput(hs);
  const parsedAs = parseScoreInput(as);
  const parsedEtHs = etHs === "" ? null : parseScoreInput(etHs);
  const parsedEtAs = etAs === "" ? null : parseScoreInput(etAs);
  const scoresEntered = hs !== "" && as !== "";
  const isDraw90 =
    scoresEntered &&
    Number.isFinite(parsedHs) &&
    Number.isFinite(parsedAs) &&
    isDrawScore(parsedHs, parsedAs);
  const etScoresEntered = etHs !== "" && etAs !== "";
  const isDrawEt =
    etScoresEntered &&
    parsedEtHs != null &&
    parsedEtAs != null &&
    Number.isFinite(parsedEtHs) &&
    Number.isFinite(parsedEtAs) &&
    isDrawScore(parsedEtHs, parsedEtAs);
  const scoreDirty =
    hs !== savedHs ||
    as !== savedAs ||
    etHs !== savedEtHs ||
    etAs !== savedEtAs ||
    penaltyWinner !== row.result_penalty_winner;
  const listIdHome = `admin-home-${row.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const listIdAway = `admin-away-${row.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  return (
    <tr className="align-top">
      <td className="px-4 py-2">
        {canEditTeams ? (
          <div className="space-y-2">
            {row.stage ? (
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {row.stage}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="min-w-0">
                <label className="mb-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">Team A</label>
                <input
                  value={homeTeam}
                  onChange={(e) => setHomeTeam(e.target.value)}
                  list={listIdHome}
                  placeholder={row.home}
                  className="h-8 w-full min-w-28 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
                />
                <datalist id={listIdHome}>
                  {teamOptions.map((team) => (
                    <option key={`${listIdHome}-${team}`} value={team} />
                  ))}
                </datalist>
              </div>
              <span className="hidden text-center text-[10px] text-zinc-400 sm:block">vs</span>
              <div className="min-w-0">
                <label className="mb-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">Team B</label>
                <input
                  value={awayTeam}
                  onChange={(e) => setAwayTeam(e.target.value)}
                  list={listIdAway}
                  placeholder={row.away}
                  className="h-8 w-full min-w-28 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
                />
                <datalist id={listIdAway}>
                  {teamOptions.map((team) => (
                    <option key={`${listIdAway}-${team}`} value={team} />
                  ))}
                </datalist>
              </div>
            </div>
            {teamsDirty ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">Unsaved team names</p>
            ) : null}
          </div>
        ) : (
          <div>
            {isKnockout && row.stage ? (
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {row.stage}
              </p>
            ) : null}
            <div className="font-normal text-zinc-900 dark:text-zinc-50">
              {row.home} vs {row.away}
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
        {row.date_label} • {row.time}
      </td>
      <td className="px-4 py-2">
        {isFinished ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            finished
          </span>
        ) : (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "scheduled" | "pending")}
            className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
          >
            <option value="scheduled">scheduled</option>
            <option value="pending">pending</option>
          </select>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">90 min</p>
          <div className="grid grid-cols-[90px_20px_90px] items-center gap-2">
            <input
              value={hs}
              onChange={(e) => setHs(normalizeScore(e.target.value))}
              placeholder="0"
              inputMode="numeric"
              className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
            />
            <div className="text-center text-zinc-500 dark:text-zinc-400">-</div>
            <input
              value={as}
              onChange={(e) => setAs(normalizeScore(e.target.value))}
              placeholder="0"
              inputMode="numeric"
              className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
            />
          </div>

          {isKnockout && isDraw90 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-white/10 dark:bg-white/5">
              <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Extra time</p>
              <div className="mt-1 grid grid-cols-[90px_20px_90px] items-center gap-2">
                <input
                  value={etHs}
                  onChange={(e) => setEtHs(normalizeScore(e.target.value))}
                  placeholder="0"
                  inputMode="numeric"
                  className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
                />
                <div className="text-center text-zinc-500 dark:text-zinc-400">-</div>
                <input
                  value={etAs}
                  onChange={(e) => setEtAs(normalizeScore(e.target.value))}
                  placeholder="0"
                  inputMode="numeric"
                  className="h-8 rounded-xl border border-zinc-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-zinc-950"
                />
              </div>

              {isDrawEt ? (
                <div className="mt-2">
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Penalties</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPenaltyWinner("home")}
                      className={`rounded-full px-2.5 py-1 text-[10px] ${
                        penaltyWinner === "home"
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                      }`}
                    >
                      {row.home}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPenaltyWinner("away")}
                      className={`rounded-full px-2.5 py-1 text-[10px] ${
                        penaltyWinner === "away"
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                      }`}
                    >
                      {row.away}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {isFinished && scoreDirty ? (
          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">Unsaved score</p>
        ) : null}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {canEditTeams && teamsDirty ? (
            <button
              type="button"
              onClick={() => onSaveTeams({ id: row.id, home: homeTeam.trim(), away: awayTeam.trim() })}
              disabled={busy || !homeTeam.trim() || !awayTeam.trim()}
              className="inline-flex h-8 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-3 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
            >
              {busy ? "Saving…" : "Save teams"}
            </button>
          ) : null}
          {!isFinished ? (
            <button
              type="button"
              onClick={() => onSaveStatus({ id: row.id, status })}
              disabled={busy}
              className="inline-flex h-8 items-center justify-center rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          ) : null}
          {!isFinished ? (
            <button
              type="button"
              onClick={() =>
                onComplete({ id: row.id, hs, as, etHs, etAs, penaltyWinner })
              }
              disabled={busy}
              className="inline-flex h-8 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {busy ? "Saving…" : "Complete"}
            </button>
          ) : null}
          {isFinished && scoreDirty ? (
            <button
              type="button"
              onClick={() =>
                onComplete({ id: row.id, hs, as, etHs, etAs, penaltyWinner })
              }
              disabled={busy}
              className="inline-flex h-8 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-3 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
            >
              {busy ? "Saving…" : "Update score"}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function AdminResults() {
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<FixtureRow[]>([]);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [fixturesRes, teamsRes] = await Promise.all([
        fetch("/api/fixtures", { cache: "no-store" }).catch(() => null),
        fetch("/api/teams", { cache: "no-store" }).catch(() => null),
      ]);

      const fixturesJson = (await fixturesRes?.json().catch(() => null)) as
        | { ok: true; fixtures: FixtureRow[] }
        | { ok: false; message: string }
        | null;
      const teamsJson = (await teamsRes?.json().catch(() => null)) as
        | { ok: true; teams: string[] }
        | { ok: false; message: string }
        | null;

      if (!fixturesRes || !fixturesJson || !fixturesJson.ok) {
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(fixturesJson.fixtures ?? []);
      setTeamOptions(teamsJson && teamsJson.ok ? (teamsJson.teams ?? []) : []);
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter((r) =>
          `${r.home} ${r.away} ${r.stage ?? ""} ${r.date_label} ${r.time}`.toLowerCase().includes(needle),
        )
      : rows;
    return [...list].sort(compareByDateAndTime);
  }, [q, rows]);

  if (!ready) return <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>;
  if (!user) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Log in to access admin.</div>;
  }
  if (!user.isAdmin) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Not authorized.</div>;
  }

  async function saveStatus(id: string, status: "scheduled" | "pending") {
    setErr(null);
    setBusyId(id);
    const res = await fetch("/api/admin/results", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: id, status }),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setErr(json && "message" in json ? json.message : "Failed to save status.");
      setBusyId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id !== id ? r : { ...r, status })));
    setBusyId(null);
  }

  async function saveTeams(id: string, home: string, away: string) {
    setErr(null);
    setBusyId(id);
    const res = await fetch("/api/admin/results", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixtureId: id, updateTeams: true, home, away }),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true; home: string; away: string }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setErr(json && "message" in json ? json.message : "Failed to save team names.");
      setBusyId(null);
      return;
    }

    setRows((prev) =>
      prev.map((r) => (r.id !== id ? r : { ...r, home: json.home, away: json.away })),
    );
    window.dispatchEvent(new Event("wc:predictions-changed"));
    setBusyId(null);
  }

  async function complete(
    id: string,
    hs: string,
    as: string,
    etHs: string,
    etAs: string,
    penaltyWinner: "home" | "away" | null,
  ) {
    setErr(null);
    setBusyId(id);
    const homeScore = parseScoreInput(hs);
    const awayScore = parseScoreInput(as);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      setErr("Enter valid 90-minute scores before saving.");
      setBusyId(null);
      return;
    }

    const row = rows.find((r) => r.id === id);
    const isKnockout = isKnockoutStage(row?.stage);
    const payload: Record<string, unknown> = {
      fixtureId: id,
      complete: true,
      homeScore: Math.floor(homeScore),
      awayScore: Math.floor(awayScore),
    };

    if (isKnockout && homeScore === awayScore) {
      const etHomeScore = parseScoreInput(etHs);
      const etAwayScore = parseScoreInput(etAs);
      if (
        !Number.isFinite(etHomeScore) ||
        !Number.isFinite(etAwayScore) ||
        etHomeScore < 0 ||
        etAwayScore < 0
      ) {
        setErr("Enter valid extra time scores when 90 minutes is a draw.");
        setBusyId(null);
        return;
      }
      payload.etHomeScore = Math.floor(etHomeScore);
      payload.etAwayScore = Math.floor(etAwayScore);
      if (etHomeScore === etAwayScore) {
        if (penaltyWinner !== "home" && penaltyWinner !== "away") {
          setErr("Pick the penalty shootout winner.");
          setBusyId(null);
          return;
        }
        payload.penaltyWinner = penaltyWinner;
      }
    }

    const res = await fetch("/api/admin/results", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    if (!res || !json || !json.ok) {
      setErr(json && "message" in json ? json.message : "Failed to save score.");
      setBusyId(null);
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id !== id
          ? r
          : {
              ...r,
              status: "finished",
              result_home_score: Math.floor(homeScore),
              result_away_score: Math.floor(awayScore),
              result_et_home_score:
                isKnockout && homeScore === awayScore
                  ? Math.floor(parseScoreInput(etHs))
                  : null,
              result_et_away_score:
                isKnockout && homeScore === awayScore
                  ? Math.floor(parseScoreInput(etAs))
                  : null,
              result_penalty_winner:
                isKnockout &&
                homeScore === awayScore &&
                parseScoreInput(etHs) === parseScoreInput(etAs)
                  ? penaltyWinner
                  : null,
            },
      ),
    );
    window.dispatchEvent(new Event("wc:predictions-changed"));
    setBusyId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (team, stage, date, time)…"
          className="h-9 w-full max-w-md rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-white/10 dark:bg-zinc-950 dark:focus:ring-white/20"
        />
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading fixtures…</div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
              <tr>
                <th className="px-4 py-2 font-normal">Match</th>
                <th className="px-4 py-2 font-normal">When</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Result</th>
                <th className="px-4 py-2 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800 dark:divide-white/10 dark:text-zinc-200">
              {filtered.slice(0, 200).map((r) => (
                <AdminResultRow
                  key={r.id}
                  row={r}
                  busy={busyId === r.id}
                  teamOptions={teamOptions}
                  onSaveStatus={({ id, status }) => void saveStatus(id, status)}
                  onSaveTeams={({ id, home, away }) => void saveTeams(id, home, away)}
                  onComplete={({ id, hs, as, etHs, etAs, penaltyWinner }) =>
                    void complete(id, hs, as, etHs, etAs, penaltyWinner)
                  }
                />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            Knockout fixtures show editable Team A / Team B fields — replace placeholders like 2A with
            real team names, then click Save teams. Finished matches can be corrected with Update score.
          </div>
        </div>
      )}
    </div>
  );
}
