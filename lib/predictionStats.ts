export type PredictionPointRow = {
  user_id: string;
  fixture_id: string;
  points: number | null;
  fixture_status: string;
  predicted_home_score: number;
  predicted_away_score: number;
  result_home_score: number | null;
  result_away_score: number | null;
  predicted_winner: "home" | "away" | "draw";
};

export type UserStatsRow = {
  userId: string;
  email: string;
  username: string | null;
  favoriteTeam: string | null;
  totalPredictions: number;
  finishedScored: number;
  awaiting: number;
  exactScores: number;
  correctOutcome: number;
  wrongOutcome: number;
  drawPredictions: number;
  drawCorrect: number;
  totalPoints: number;
  exactPct: number | null;
  outcomePct: number | null;
};

export type TournamentStatsTotals = {
  players: number;
  totalPredictions: number;
  finishedScored: number;
  exactScores: number;
  correctOutcome: number;
  wrongOutcome: number;
  totalPoints: number;
};

function actualWinner(resultHome: number, resultAway: number): "home" | "away" | "draw" {
  if (resultHome === resultAway) return "draw";
  return resultHome > resultAway ? "home" : "away";
}

function hasFinalScore(row: PredictionPointRow) {
  return (
    row.fixture_status === "finished" &&
    row.result_home_score != null &&
    row.result_away_score != null
  );
}

export function aggregateUserStats(
  users: {
    id: string;
    email: string | null;
    username: string | null;
    favorite_team: string | null;
  }[],
  pointRows: PredictionPointRow[],
): UserStatsRow[] {
  const byUser = new Map<string, UserStatsRow>();

  for (const user of users) {
    byUser.set(user.id, {
      userId: user.id,
      email: user.email ?? "",
      username: user.username,
      favoriteTeam: user.favorite_team,
      totalPredictions: 0,
      finishedScored: 0,
      awaiting: 0,
      exactScores: 0,
      correctOutcome: 0,
      wrongOutcome: 0,
      drawPredictions: 0,
      drawCorrect: 0,
      totalPoints: 0,
      exactPct: null,
      outcomePct: null,
    });
  }

  for (const row of pointRows) {
    const stats = byUser.get(row.user_id);
    if (!stats) continue;

    stats.totalPredictions += 1;
    if (row.points != null) {
      stats.totalPoints += row.points;
    }

    if (row.predicted_winner === "draw") {
      stats.drawPredictions += 1;
    }

    if (!hasFinalScore(row)) {
      stats.awaiting += 1;
      continue;
    }

    stats.finishedScored += 1;

    const rh = row.result_home_score!;
    const ra = row.result_away_score!;
    const exact =
      row.predicted_home_score === rh && row.predicted_away_score === ra;
    const winner = actualWinner(rh, ra);
    const outcomeCorrect = row.predicted_winner === winner;

    if (exact) {
      stats.exactScores += 1;
    } else if (outcomeCorrect) {
      stats.correctOutcome += 1;
    } else {
      stats.wrongOutcome += 1;
    }

    if (row.predicted_winner === "draw" && winner === "draw") {
      stats.drawCorrect += 1;
    }
  }

  for (const stats of byUser.values()) {
    if (stats.finishedScored > 0) {
      stats.exactPct = Math.round((stats.exactScores / stats.finishedScored) * 100);
      stats.outcomePct = Math.round(
        ((stats.exactScores + stats.correctOutcome) / stats.finishedScored) * 100,
      );
    }
  }

  return [...byUser.values()].sort((a, b) => {
    const byPoints = b.totalPoints - a.totalPoints;
    if (byPoints !== 0) return byPoints;
    const byExact = b.exactScores - a.exactScores;
    if (byExact !== 0) return byExact;
    const nameA = a.username ?? a.email;
    const nameB = b.username ?? b.email;
    return nameA.localeCompare(nameB);
  });
}

export type FunAward = {
  key: string;
  title: string;
  blurb: string;
  winnerName: string;
  value: string;
};

export type FunFact = {
  key: string;
  text: string;
};

function nameFor(row: UserStatsRow) {
  if (row.username) return row.username;
  if (row.email) return row.email.split("@")[0] ?? row.email;
  return "Player";
}

function topByMetric(
  candidates: UserStatsRow[],
  metric: (row: UserStatsRow) => number,
  highest: boolean,
): UserStatsRow | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) =>
    highest ? metric(b) - metric(a) : metric(a) - metric(b),
  );
  return sorted[0] ?? null;
}

const MIN_AWARD_SAMPLE = 5;

export function computeFunAwards(
  rows: UserStatsRow[],
  pointRows: PredictionPointRow[],
): { awards: FunAward[]; facts: FunFact[] } {
  const goalsByUser = new Map<string, { totalGoals: number; predictions: number }>();
  const globalScorelines = new Map<string, number>();
  let totalGoalsPredicted = 0;
  let totalPredictions = 0;
  let totalDrawsPredicted = 0;

  for (const row of pointRows) {
    const goals = row.predicted_home_score + row.predicted_away_score;
    totalGoalsPredicted += goals;
    totalPredictions += 1;
    if (row.predicted_winner === "draw") totalDrawsPredicted += 1;

    const scoreline = `${row.predicted_home_score}-${row.predicted_away_score}`;
    globalScorelines.set(scoreline, (globalScorelines.get(scoreline) ?? 0) + 1);

    const entry = goalsByUser.get(row.user_id) ?? { totalGoals: 0, predictions: 0 };
    entry.totalGoals += goals;
    entry.predictions += 1;
    goalsByUser.set(row.user_id, entry);
  }

  const active = rows.filter((r) => r.totalPredictions > 0);
  const qualified = active.filter((r) => r.totalPredictions >= MIN_AWARD_SAMPLE);
  const pool = qualified.length > 0 ? qualified : active;

  const awards: FunAward[] = [];

  function pushAward(
    key: string,
    title: string,
    blurb: string,
    candidates: UserStatsRow[],
    metric: (row: UserStatsRow) => number,
    format: (row: UserStatsRow) => string,
    highest = true,
  ) {
    const winner = topByMetric(candidates, metric, highest);
    if (!winner) return;
    awards.push({ key, title, blurb, winnerName: nameFor(winner), value: format(winner) });
  }

  pushAward(
    "oracle",
    "The Oracle",
    "Best exact-score accuracy",
    pool.filter((r) => r.exactPct != null),
    (r) => r.exactPct ?? 0,
    (r) => `${r.exactPct}% exact`,
  );

  pushAward(
    "wooden-spoon",
    "Wooden Spoon",
    "Fewest points on the board",
    active,
    (r) => r.totalPoints,
    (r) => `${r.totalPoints} pts`,
    false,
  );

  pushAward(
    "fence-sitter",
    "Fence Sitter",
    "Can't resist calling a draw",
    pool,
    (r) => r.drawPredictions / r.totalPredictions,
    (r) => `${Math.round((r.drawPredictions / r.totalPredictions) * 100)}% draw picks`,
  );

  pushAward(
    "bridesmaid",
    "So Close!",
    "Right winner, wrong score — the most",
    active,
    (r) => r.correctOutcome,
    (r) => `${r.correctOutcome} near misses`,
  );

  pushAward(
    "chaos-agent",
    "Chaos Agent",
    "Called the wrong winner most often",
    active,
    (r) => r.wrongOutcome,
    (r) => `${r.wrongOutcome} wrong calls`,
  );

  pushAward(
    "completionist",
    "The Completionist",
    "Never missed a fixture",
    active,
    (r) => r.totalPredictions,
    (r) => `${r.totalPredictions} predictions`,
  );

  const goalRows = pool
    .map((r) => {
      const raw = goalsByUser.get(r.userId);
      if (!raw || raw.predictions === 0) return null;
      return { row: r, avgGoals: raw.totalGoals / raw.predictions };
    })
    .filter((v): v is { row: UserStatsRow; avgGoals: number } => v !== null);

  const mostGoals = goalRows.length
    ? [...goalRows].sort((a, b) => b.avgGoals - a.avgGoals)[0]
    : undefined;
  const fewestGoals = goalRows.length
    ? [...goalRows].sort((a, b) => a.avgGoals - b.avgGoals)[0]
    : undefined;

  if (mostGoals) {
    awards.push({
      key: "goal-rush",
      title: "Goal Rush",
      blurb: "Predicts the highest-scoring matches",
      winnerName: nameFor(mostGoals.row),
      value: `${mostGoals.avgGoals.toFixed(1)} goals/match picked`,
    });
  }

  if (fewestGoals) {
    awards.push({
      key: "lockdown-defender",
      title: "Lockdown Defender",
      blurb: "Predicts the tightest, lowest-scoring matches",
      winnerName: nameFor(fewestGoals.row),
      value: `${fewestGoals.avgGoals.toFixed(1)} goals/match picked`,
    });
  }

  let topScoreline: string | null = null;
  let topScorelineCount = 0;
  for (const [scoreline, count] of globalScorelines) {
    if (count > topScorelineCount) {
      topScoreline = scoreline;
      topScorelineCount = count;
    }
  }

  const facts: FunFact[] = [];
  if (totalPredictions > 0) {
    facts.push({
      key: "avg-goals",
      text: `On average, players predict ${(totalGoalsPredicted / totalPredictions).toFixed(1)} goals per match.`,
    });
    facts.push({
      key: "draw-share",
      text: `${Math.round((totalDrawsPredicted / totalPredictions) * 100)}% of all predictions submitted have been draws.`,
    });
  }
  if (topScoreline) {
    facts.push({
      key: "top-scoreline",
      text: `${topScoreline} is the most popular scoreline pick — called ${topScorelineCount} time${
        topScorelineCount === 1 ? "" : "s"
      } across the league.`,
    });
  }

  return { awards, facts };
}

export function aggregateTournamentTotals(rows: UserStatsRow[]): TournamentStatsTotals {
  return rows.reduce(
    (acc, row) => ({
      players: acc.players + (row.totalPredictions > 0 ? 1 : 0),
      totalPredictions: acc.totalPredictions + row.totalPredictions,
      finishedScored: acc.finishedScored + row.finishedScored,
      exactScores: acc.exactScores + row.exactScores,
      correctOutcome: acc.correctOutcome + row.correctOutcome,
      wrongOutcome: acc.wrongOutcome + row.wrongOutcome,
      totalPoints: acc.totalPoints + row.totalPoints,
    }),
    {
      players: 0,
      totalPredictions: 0,
      finishedScored: 0,
      exactScores: 0,
      correctOutcome: 0,
      wrongOutcome: 0,
      totalPoints: 0,
    },
  );
}
