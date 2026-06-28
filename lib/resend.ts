import { Resend } from "resend";
import { flagUrlForTeam } from "@/lib/fixtures";

export type PredictionEmailPayload = {
  userDisplay: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  winner: "home" | "away" | "draw";
  dateLabel: string;
  time: string;
  city?: string | null;
};

function winnerLabel(payload: PredictionEmailPayload) {
  if (payload.winner === "draw") return "Draw";
  if (payload.winner === "home") return payload.home;
  return payload.away;
}

function buildPredictionEmailHtml(payload: PredictionEmailPayload) {
  const score = `${payload.homeScore} – ${payload.awayScore}`;
  const winner = winnerLabel(payload);
  const when = [payload.dateLabel, payload.time, payload.city].filter(Boolean).join(" · ");

  return `
    <h2>New WC26 prediction saved</h2>
    <p><strong>${payload.userDisplay}</strong> submitted a prediction.</p>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
      <tr><td><strong>Match</strong></td><td>${payload.home} vs ${payload.away}</td></tr>
      <tr><td><strong>Score</strong></td><td>${score}</td></tr>
      <tr><td><strong>Winner</strong></td><td>${winner}</td></tr>
      <tr><td><strong>When</strong></td><td>${when}</td></tr>
    </table>
  `.trim();
}

export type PredictionWindowClosedPayload = {
  home: string;
  away: string;
  dateLabel: string;
  time: string;
  city?: string | null;
  closedAt: string;
  predictions: {
    userDisplay: string;
    homeScore: number;
    awayScore: number;
    winner: string;
    extraTime: string | null;
    penalties: string | null;
  }[];
};

function teamFlagImg(team: string) {
  const url = flagUrlForTeam(team, 40);
  if (!url) return "";
  return `<img src="${url}" alt="" width="24" height="18" style="vertical-align:middle;margin-right:6px;border-radius:2px;border:1px solid #e5e7eb" />`;
}

function matchWithFlagsHtml(home: string, away: string) {
  return `${teamFlagImg(home)}${home} &nbsp;vs&nbsp; ${teamFlagImg(away)}${away}`;
}

function buildPredictionWindowClosedHtml(payload: PredictionWindowClosedPayload) {
  const when = [payload.dateLabel, payload.time, payload.city].filter(Boolean).join(" · ");
  const closedAt = new Date(payload.closedAt).toUTCString();
  const matchLine = matchWithFlagsHtml(payload.home, payload.away);

  const rows =
    payload.predictions.length === 0
      ? "<tr><td colspan='5'>No predictions submitted.</td></tr>"
      : payload.predictions
          .map(
            (p) => `
      <tr>
        <td>${p.userDisplay}</td>
        <td>${p.homeScore} – ${p.awayScore}</td>
        <td>${p.winner}</td>
        <td>${p.extraTime ?? "—"}</td>
        <td>${p.penalties ?? "—"}</td>
      </tr>`,
          )
          .join("");

  return `
    <h2>WC26 predictions closed</h2>
    <p>The prediction window has closed for <strong>${matchLine}</strong> (1 hour before kickoff).</p>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px">
      <tr><td><strong>Match</strong></td><td>${matchLine}</td></tr>
      <tr><td><strong>When</strong></td><td>${when}</td></tr>
      <tr><td><strong>Closed at</strong></td><td>${closedAt}</td></tr>
      <tr><td><strong>Predictions</strong></td><td>${payload.predictions.length}</td></tr>
    </table>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse" border="1">
      <thead>
        <tr><th>User</th><th>Score (90 min)</th><th>Winner</th><th>Extra time</th><th>Penalties</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `.trim();
}

export const PREDICTION_NOTIFY_EMAILS = [
  "rupakt525@gmail.com",
  "anishdangi999@gmail.com",
  "trobinson@wspactuaries.com",
  "todd@clarosanalytics.com",
  "nsachdeva@clarosanalytics.com",
  "sshrestha@clarosanalytics.com",
  "nwaiba@clarosanalytics.com",
  "mowen@clarosanalytics.com",
  "rthapa@clarosanalytics.com",
  "gmiller@clarosanalytics.com",
  "sbowman@wspactuaries.com",
  "dwolsk@clarosanalytics.com",
  "cghimire@clarosanalytics.com",
  "dshrestha@clarosanalytics.com",
  "sbajracharya@clarosanalytics.com",
  "jdare@clarosanalytics.com",
  "jsouthward@clarosanalytics.com",
  "ericawclaros@gmail.com",
  "ppatel@clarosanalytics.com",
  "eweiner@clarosanalytics.com",
  "svaidya@clarosanalytics.com",
  "sparajuli@clarosanalytics.com",
  "rpradhan@clarosanalytics.com",
  "clarosmanish@gmail.com",
  "psthapit@clarosanalytics.com",
  "ggiri@clarosanalytics.com",
  "rsapkota@gmail.com",
  "stillett@clarosanalytics.com",
  "bvaidya@clarosanalytics.com",
] as const;

export function getPredictionNotifyEmails() {
  return [...PREDICTION_NOTIFY_EMAILS];
}

export async function sendPredictionWindowClosedEmail(payload: PredictionWindowClosedPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = getPredictionNotifyEmails();

  if (!apiKey || !from) {
    console.warn("[resend] prediction-close skipped — missing config", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      to,
    });
    return;
  }

  const subject = `WC26 predictions closed: ${payload.home} vs ${payload.away} (${payload.predictions.length})`;
  const logContext = {
    from,
    to,
    subject,
    match: `${payload.home} vs ${payload.away}`,
    predictionCount: payload.predictions.length,
    closedAt: payload.closedAt,
  };

  console.log("[resend] prediction-close sending", logContext);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html: buildPredictionWindowClosedHtml(payload),
  });

  if (error) {
    console.error("[resend] prediction-close failed", { ...logContext, error });
    throw new Error(error.message);
  }

  console.log("[resend] prediction-close sent", {
    ...logContext,
    resendId: data?.id ?? null,
  });
}

export async function sendPredictionCompleteEmail(payload: PredictionEmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = getPredictionNotifyEmails();

  if (!apiKey || !from) {
    console.warn("[resend] prediction saved skipped — missing config", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      to,
    });
    return;
  }

  const subject = `WC26 prediction: ${payload.home} ${payload.homeScore}-${payload.awayScore} ${payload.away}`;
  const logContext = {
    from,
    to,
    subject,
    userDisplay: payload.userDisplay,
    match: `${payload.home} vs ${payload.away}`,
  };

  console.log("[resend] prediction saved sending", logContext);

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html: buildPredictionEmailHtml(payload),
  });

  if (error) {
    console.error("[resend] prediction saved failed", { ...logContext, error });
    throw new Error(error.message);
  }

  console.log("[resend] prediction saved sent", {
    ...logContext,
    resendId: data?.id ?? null,
  });
}
