import { TopBar } from "@/app/components/TopBar";
import { RequireAuth } from "@/app/components/RequireAuth";
import { StatsView } from "@/app/components/StatsView";

export default function StatsPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-secondary-50 font-sans text-primary-text">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className="mb-8 sm:mb-10">
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">Stats</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary-text sm:text-base">
              See how your predictions stack up as the tournament wraps up.
            </p>
          </div>
          <StatsView />
        </main>
      </div>
    </RequireAuth>
  );
}
