const RULES = [
  {
    points: 3,
    label: "Exact score or draw",
    example:
      "Pick 2-1 and result is 2-1, or pick 0-0 and result is 0-0, or pick 1-1 and result is 1-1.",
    tone: "primary" as const,
  },
  {
    points: 2,
    label: "Correct winner",
    example:
      "Pick 3-2, result 2-1 (right winner). Pick 0-0, result 1-1 (draw, wrong score). Pick 1-3, result 0-2 (right winner).",
    tone: "yellow" as const,
  },
  {
    points: 1,
    label: "Participated",
    example:
      "Pick 0-0, result 2-0 (wrong outcome). Pick 2-0, result 1-2 (wrong winner and score). Any saved pick on a finished match earns 1 pt.",
    tone: "surface" as const,
  },
  {
    points: 0,
    label: "No prediction",
    example: "No pick submitted before predictions closed (1 hour before kickoff).",
    tone: "muted" as const,
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

export function ScoringGuide() {
  return (
    <section
      className="rounded-lg border border-secondary-border bg-surface-blue-50 px-3 py-2 sm:px-4 sm:py-2.5"
      aria-label="How points work"
    >
      <p className="font-semibold text-xs text-primary-dark sm:text-sm">How points work</p>

      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 sm:gap-x-4">
        {RULES.map((rule) => {
          const tipId = `scoring-tip-${rule.points}`;
          return (
            <li key={rule.label} className="group relative min-w-0">
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-1 text-left text-xs text-primary-text"
                aria-describedby={tipId}
                title={rule.example}
              >
                <span
                  className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 font-semibold text-[10px] tabular-nums ring-1 ${badgeClass[rule.tone]}`}
                >
                  {rule.points}
                </span>
                <span className="truncate font-medium underline decoration-secondary-border decoration-dotted underline-offset-2">
                  {rule.label}
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
                {rule.example}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
