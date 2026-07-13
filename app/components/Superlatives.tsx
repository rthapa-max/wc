import Link from "next/link";
import type { FunAward, FunFact } from "@/lib/predictionStats";

const AWARD_ACCENTS = [
  {
    badge: "bg-primary-600 text-primary-foreground",
    card: "border-primary-200 bg-linear-to-br from-primary-50 to-background",
  },
  {
    badge: "bg-yellow-400 text-brown-500",
    card: "border-yellow-400 bg-linear-to-br from-yellow-300/40 to-background",
  },
  {
    badge: "bg-surface-blue-300 text-primary-700",
    card: "border-surface-blue-200 bg-linear-to-br from-surface-blue-50 to-background",
  },
  {
    badge: "bg-orange-500 text-white",
    card: "border-orange-50 bg-linear-to-br from-orange-50 to-background",
  },
] as const;

function MedalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="10" r="4.25" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M6 6.5 4.5 2h2L8 5l1.5-3h2L10 6.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.75 10.25 7.6 11.1l1.65-1.85" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Superlatives({
  awards,
  facts,
  loading,
  showStatsLink,
}: {
  awards: FunAward[];
  facts: FunFact[];
  loading: boolean;
  showStatsLink?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary-200 bg-linear-to-br from-primary-50 via-background to-surface-blue-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-primary-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-1.5 font-semibold text-base text-primary-text sm:text-lg">
            <MedalIcon />
            Fun Awards
          </h2>
          <p className="mt-0.5 text-xs font-medium text-primary-700">
            Who&apos;s crushing it, who&apos;s not, and everything in between.
          </p>
        </div>
        {showStatsLink ? (
          <Link
            href="/stats"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-primary-600 px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-700"
          >
            View my stats
          </Link>
        ) : null}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {loading ? (
          <div className="py-6 text-center text-sm text-secondary-text">Crunching the numbers…</div>
        ) : awards.length === 0 ? (
          <div className="py-6 text-center text-sm text-secondary-text">
            Not enough predictions yet to hand out awards.
          </div>
        ) : (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
            {awards.map((award, index) => {
              const accent = AWARD_ACCENTS[index % AWARD_ACCENTS.length];
              return (
                <div
                  key={award.key}
                  className={`min-w-[13rem] shrink-0 snap-start rounded-xl border px-4 py-3.5 sm:min-w-0 sm:shrink ${accent.card}`}
                >
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accent.badge}`}
                  >
                    {award.title}
                  </span>
                  <p className="mt-2 text-[11px] text-secondary-text">{award.blurb}</p>
                  <p className="mt-2 truncate font-semibold text-primary-text">{award.winnerName}</p>
                  <p className="text-xs text-secondary-text">{award.value}</p>
                </div>
              );
            })}
          </div>
        )}

        {facts.length > 0 ? (
          <div className="mt-4 rounded-lg border border-primary-100 bg-background/70 px-4 py-3 sm:px-5">
            <p className="text-xs font-semibold text-primary-dark sm:text-sm">Fun facts from the league</p>
            <ul className="mt-2 space-y-1.5 text-xs text-secondary-text sm:text-sm">
              {facts.map((fact) => (
                <li key={fact.key}>{fact.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
