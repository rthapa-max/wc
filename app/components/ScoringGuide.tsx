const GROUP_RULES = [
  {
    points: 3,
    label: "Exact score",
    example: "Pick 2-1 and result is 2-1, or pick 1-1 and result is 1-1.",
    tone: "primary" as const,
  },
  {
    points: 2,
    label: "Correct winner",
    example: "Pick 3-2, result 2-1 (right winner). Pick 0-0, result 1-1 (draw, wrong score).",
    tone: "yellow" as const,
  },
  {
    points: 1,
    label: "Participated",
    example: "Any saved pick on a finished match earns 1 pt if the outcome is wrong.",
    tone: "surface" as const,
  },
] as const;

const KNOCKOUT_V2_RULES = [
  {
    points: "5",
    label: "Exact score (full-time)",
    example: "Pick 3-2 and result is 3-2 after regular time.",
    tone: "primary" as const,
  },
  {
    points: "3",
    label: "Correct outcome",
    example: "Pick 3-2, result 2-1 (right winner). Pick 2-2, result 1-1 (draw, wrong score).",
    tone: "yellow" as const,
  },
  {
    points: "+3",
    label: "Exact penalties",
    example: "Only if you predicted a draw at full-time — exact shootout score (e.g. 5-4).",
    tone: "surface" as const,
  },
  {
    points: "+2",
    label: "Penalty winner",
    example: "Correct penalty winner but wrong shootout score (e.g. pick 5-4, result 4-3).",
    tone: "muted" as const,
  },
  {
    points: "0",
    label: "Wrong outcome",
    example:
      "Pick 3-2 but full-time ends 2-2 — 0 pts even if penalties are correct. Penalties only count when you predicted a draw.",
    tone: "surface" as const,
  },
] as const;

const badgeClass = {
  primary: "bg-primary-100 text-primary-700 ring-primary-200",
  yellow: "bg-yellow-300 text-brown-500 ring-yellow-400",
  surface: "bg-surface-blue-300 text-primary-700 ring-surface-blue-200",
  muted: "bg-secondary-100 text-tertiary-600 ring-secondary-200",
};

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8 7.25v3.5M8 5.25h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RuleRow({
  points,
  label,
  example,
  tone,
}: {
  points: string;
  label: string;
  example: string;
  tone: keyof typeof badgeClass;
}) {
  const tipId = `scoring-tip-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <li className="group relative min-w-0">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1 text-left text-xs text-primary-text"
        aria-describedby={tipId}
        title={example}
      >
        <span
          className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 font-semibold text-[10px] tabular-nums ring-1 ${badgeClass[tone]}`}
        >
          {points}
        </span>
        <span className="truncate font-medium underline decoration-secondary-border decoration-dotted underline-offset-2">
          {label}
        </span>
        <span className="shrink-0 text-tertiary-400">
          <InfoIcon />
        </span>
      </button>
      <div
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 hidden w-52 rounded-md border border-secondary-border bg-background px-2.5 py-2 text-[11px] leading-snug text-secondary-text shadow-md group-hover:block group-focus-within:block sm:w-56"
      >
        <span className="font-medium text-primary-text">Example: </span>
        {example}
      </div>
    </li>
  );
}

export function ScoringGuide() {
  return (
    <section
      className="rounded-lg border border-secondary-border bg-surface-blue-50 px-3 py-2 sm:px-4 sm:py-2.5"
      aria-label="How points work"
    >
      <p className="font-semibold text-xs text-primary-dark sm:text-sm">How points work</p>

      <div className="mt-2 space-y-3">
        <div>
          <p className="text-[11px] font-medium text-secondary-text sm:text-xs">Group stage</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 sm:gap-x-4">
            {GROUP_RULES.map((rule) => (
              <RuleRow
                key={rule.label}
                points={String(rule.points)}
                label={rule.label}
                example={rule.example}
                tone={rule.tone}
              />
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] font-medium text-secondary-text sm:text-xs">
            Knockout — 5/3/0 after full-time, plus up to 3 penalty points (no participation pts)
          </p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5 sm:gap-x-4">
            {KNOCKOUT_V2_RULES.map((rule) => (
              <RuleRow
                key={rule.label}
                points={rule.points}
                label={rule.label}
                example={rule.example}
                tone={rule.tone}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
