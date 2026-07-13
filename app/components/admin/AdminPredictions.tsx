"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import {
  etWinnerFromScores,
  formatPenaltyShootoutResult,
  isDrawScore,
  type EtWinnerPick,
} from "@/lib/knockoutPrediction";
import { usesLegacyKnockoutScoring } from "@/lib/knockoutScoring";
import { isKnockoutStage } from "@/lib/teams";

type UserRow = {
  id: string;
  email: string | null;
  username: string | null;
};

type FixtureRow = {
  id: string;
  date_label: string;
  time: string;
  home: string;
  away: string;
  stage: string | null;
  status: string;
  knockout_scoring_version: "legacy" | "v2" | null;
};

type PredictionRow = {
  home_score: number;
  away_score: number;
  et_home_score: number | null;
  et_away_score: number | null;
  penalty_winner: "home" | "away" | null;
  penalty_home_score: number | null;
  penalty_away_score: number | null;
};

function userLabel(user: UserRow) {
  if (user.username) return `@${user.username}`;
  return user.email ?? user.id;
}

function normalizeScore(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/^0+(?=\d)/, "");
}

export function AdminPredictions() {
  const { user, ready } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [etWinner, setEtWinner] = useState<EtWinnerPick | null>(null);
  const [penaltyWinner, setPenaltyWinner] = useState<"home" | "away" | null>(null);
  const [penaltyHomeScore, setPenaltyHomeScore] = useState("");
  const [penaltyAwayScore, setPenaltyAwayScore] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [fixtureQuery, setFixtureQuery] = useState("");

  const selectedFixture = useMemo(
    () => fixtures.find((f) => f.id === fixtureId) ?? null,
    [fixtureId, fixtures],
  );
  const isKnockout = isKnockoutStage(selectedFixture?.stage);
  const legacyKnockout = usesLegacyKnockoutScoring(selectedFixture?.knockout_scoring_version);

  const parsedHome = homeScore === "" ? 0 : Number(homeScore);
  const parsedAway = awayScore === "" ? 0 : Number(awayScore);
  const isDraw90 =
    homeScore !== "" &&
    awayScore !== "" &&
    Number.isFinite(parsedHome) &&
    Number.isFinite(parsedAway) &&
    isDrawScore(parsedHome, parsedAway);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => userLabel(u).toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }, [userQuery, users]);

  const filteredFixtures = useMemo(() => {
    const q = fixtureQuery.trim().toLowerCase();
    if (!q) return fixtures;
    return fixtures.filter((f) =>
      `${f.home} ${f.away} ${f.stage ?? ""} ${f.date_label} ${f.time}`.toLowerCase().includes(q),
    );
  }, [fixtureQuery, fixtures]);

  const penHomeNum = penaltyHomeScore === "" ? null : Number(penaltyHomeScore);
  const penAwayNum = penaltyAwayScore === "" ? null : Number(penaltyAwayScore);
  const penaltyPreview =
    penHomeNum != null &&
    penAwayNum != null &&
    Number.isFinite(penHomeNum) &&
    Number.isFinite(penAwayNum) &&
    penHomeNum !== penAwayNum &&
    selectedFixture
      ? formatPenaltyShootoutResult(selectedFixture.home, selectedFixture.away, penHomeNum, penAwayNum)
      : null;

  const applyPrediction = useCallback((prediction: PredictionRow | null) => {
    if (!prediction) {
      setHomeScore("");
      setAwayScore("");
      setEtWinner(null);
      setPenaltyWinner(null);
      setPenaltyHomeScore("");
      setPenaltyAwayScore("");
      return;
    }

    setHomeScore(String(prediction.home_score));
    setAwayScore(String(prediction.away_score));
    setEtWinner(etWinnerFromScores(prediction.et_home_score, prediction.et_away_score));
    setPenaltyWinner(
      prediction.penalty_winner === "home" || prediction.penalty_winner === "away"
        ? prediction.penalty_winner
        : null,
    );
    setPenaltyHomeScore(
      prediction.penalty_home_score == null ? "" : String(prediction.penalty_home_score),
    );
    setPenaltyAwayScore(
      prediction.penalty_away_score == null ? "" : String(prediction.penalty_away_score),
    );
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/admin/predictions", { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok: true; users: UserRow[]; fixtures: FixtureRow[] }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) {
        setUsers([]);
        setFixtures([]);
        setLoading(false);
        return;
      }

      setUsers(json.users ?? []);
      setFixtures(json.fixtures ?? []);
      setLoading(false);
    }

    void load();
  }, []);

  useEffect(() => {
    if (!userId || !fixtureId) {
      applyPrediction(null);
      return;
    }

    async function loadPrediction() {
      const res = await fetch(
        `/api/admin/predictions?userId=${encodeURIComponent(userId)}&fixtureId=${encodeURIComponent(fixtureId)}`,
        { cache: "no-store" },
      ).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok: true; prediction: PredictionRow | null }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) return;
      applyPrediction(json.prediction);
    }

    void loadPrediction();
  }, [applyPrediction, fixtureId, userId]);

  useEffect(() => {
    if (!isKnockout || !isDraw90) {
      setEtWinner(null);
      setPenaltyWinner(null);
      setPenaltyHomeScore("");
      setPenaltyAwayScore("");
      return;
    }
    if (!legacyKnockout) {
      setEtWinner(null);
    }
    if (legacyKnockout && etWinner !== "draw") {
      setPenaltyWinner(null);
    }
  }, [etWinner, isDraw90, isKnockout, legacyKnockout]);

  async function save() {
    if (!userId || !fixtureId) {
      setErr("Select a user and a fixture.");
      return;
    }

    const hs = homeScore === "" ? 0 : Number(homeScore);
    const as = awayScore === "" ? 0 : Number(awayScore);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) {
      setErr("Enter valid scores.");
      return;
    }

    setErr(null);
    setSuccess(null);
    setSaving(true);

    const payload: Record<string, unknown> = {
      userId,
      fixtureId,
      homeScore: Math.floor(hs),
      awayScore: Math.floor(as),
    };

    if (isKnockout && isDrawScore(hs, as)) {
      if (legacyKnockout) {
        if (etWinner === "home" || etWinner === "away" || etWinner === "draw") {
          payload.etWinner = etWinner;
        }
        if (etWinner === "draw" && (penaltyWinner === "home" || penaltyWinner === "away")) {
          payload.penaltyWinner = penaltyWinner;
        }
      } else {
        const ph = penaltyHomeScore === "" ? null : Number(penaltyHomeScore);
        const pa = penaltyAwayScore === "" ? null : Number(penaltyAwayScore);
        if (ph != null && pa != null) {
          payload.penaltyHomeScore = Math.floor(ph);
          payload.penaltyAwayScore = Math.floor(pa);
        }
      }
    }

    const res = await fetch("/api/admin/predictions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    const json = (await res?.json().catch(() => null)) as
      | { ok: true }
      | { ok: false; message: string }
      | null;

    setSaving(false);

    if (!res || !json || !json.ok) {
      setErr(json && "message" in json ? json.message : "Failed to save prediction.");
      return;
    }

    const selectedUser = users.find((u) => u.id === userId);
    setSuccess(`Saved prediction for ${selectedUser ? userLabel(selectedUser) : "user"}.`);
    window.dispatchEvent(new Event("wc:predictions-changed"));
  }

  if (!ready) return <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>;
  if (!user?.isAdmin) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-950">
      <div>
        <h2 className="font-semibold text-base text-zinc-900 dark:text-zinc-50">Add prediction for user</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Enter or update a prediction on behalf of a user for a pending fixture — even after the
          public prediction window has closed. The fixture must be set to <strong>pending</strong>.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading users and fixtures…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">User</label>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search users…"
              className="mb-2 h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-950"
            />
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-950"
            >
              <option value="">Select user…</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">Fixture</label>
            <input
              value={fixtureQuery}
              onChange={(e) => setFixtureQuery(e.target.value)}
              placeholder="Search fixtures…"
              className="mb-2 h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-950"
            />
            <select
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-zinc-950"
            >
              <option value="">Select fixture…</option>
              {filteredFixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.home} vs {f.away} · {f.date_label} {f.time}
                  {f.stage ? ` · ${f.stage}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {selectedFixture ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {selectedFixture.home} vs {selectedFixture.away}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {selectedFixture.date_label} · {selectedFixture.time}
            {selectedFixture.stage ? ` · ${selectedFixture.stage}` : ""}
          </p>

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {isKnockout && !legacyKnockout ? "Full-time" : "Score"}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <input
                inputMode="numeric"
                value={homeScore}
                onChange={(e) => setHomeScore(normalizeScore(e.target.value))}
                placeholder="0"
                className="h-10 w-16 rounded-xl border border-zinc-200 bg-white px-2 text-center text-sm tabular-nums dark:border-white/10 dark:bg-zinc-950"
                aria-label={`${selectedFixture.home} score`}
              />
              <span className="text-zinc-400">-</span>
              <input
                inputMode="numeric"
                value={awayScore}
                onChange={(e) => setAwayScore(normalizeScore(e.target.value))}
                placeholder="0"
                className="h-10 w-16 rounded-xl border border-zinc-200 bg-white px-2 text-center text-sm tabular-nums dark:border-white/10 dark:bg-zinc-950"
                aria-label={`${selectedFixture.away} score`}
              />
            </div>
          </div>

          {isKnockout && isDraw90 && legacyKnockout ? (
            <div className="mt-4">
              <p className="text-[10px] font-medium text-zinc-500">Extra time</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["home", "draw", "away"] as const).map((pick) => (
                  <button
                    key={pick}
                    type="button"
                    onClick={() => setEtWinner(pick)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      etWinner === pick
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                    }`}
                  >
                    {pick === "home"
                      ? selectedFixture.home
                      : pick === "away"
                        ? selectedFixture.away
                        : "Draw"}
                  </button>
                ))}
              </div>
              {etWinner === "draw" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPenaltyWinner("home")}
                    className={`rounded-full px-3 py-1 text-xs ${
                      penaltyWinner === "home"
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                    }`}
                  >
                    {selectedFixture.home} pens
                  </button>
                  <button
                    type="button"
                    onClick={() => setPenaltyWinner("away")}
                    className={`rounded-full px-3 py-1 text-xs ${
                      penaltyWinner === "away"
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950"
                    }`}
                  >
                    {selectedFixture.away} pens
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {isKnockout && isDraw90 && !legacyKnockout ? (
            <div className="mt-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Penalty shootout
              </p>
              <div className="mt-2 grid max-w-xs grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div>
                  <label className="mb-1 block truncate text-[10px] text-zinc-500">
                    {selectedFixture.home}
                  </label>
                  <input
                    inputMode="numeric"
                    value={penaltyHomeScore}
                    onChange={(e) => setPenaltyHomeScore(normalizeScore(e.target.value))}
                    className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2 text-center text-sm tabular-nums dark:border-white/10 dark:bg-zinc-950"
                  />
                </div>
                <span className="pb-2 text-zinc-400">-</span>
                <div>
                  <label className="mb-1 block truncate text-[10px] text-zinc-500">
                    {selectedFixture.away}
                  </label>
                  <input
                    inputMode="numeric"
                    value={penaltyAwayScore}
                    onChange={(e) => setPenaltyAwayScore(normalizeScore(e.target.value))}
                    className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2 text-center text-sm tabular-nums dark:border-white/10 dark:bg-zinc-950"
                  />
                </div>
              </div>
              {penaltyPreview ? (
                <p className="mt-2 text-xs font-medium text-primary-700 dark:text-primary-300">
                  {penaltyPreview}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-200">
          {success}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !userId || !fixtureId}
        className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {saving ? "Saving…" : "Save prediction"}
      </button>
    </section>
  );
}
