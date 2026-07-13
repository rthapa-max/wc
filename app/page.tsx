import { TopBar } from "@/app/components/TopBar";
import { LeaderboardTable } from "@/app/components/LeaderboardTable";
import { HomeSuperlatives } from "@/app/components/HomeSuperlatives";
import { FixturesFromSupabase } from "@/app/components/FixturesFromSupabase";
import { RequireAuth } from "@/app/components/RequireAuth";

export default function Home() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-secondary-50 font-sans text-primary-text">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
          {/* <div className="mb-8 sm:mb-10">
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">World Cup 2026</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary-text sm:text-base">
              Predict match scores, earn points, and track your rank on the leaderboard.
            </p>
          </div> */}

          <div className="space-y-8 sm:space-y-10">
            <HomeSuperlatives />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8 lg:items-start">
              <section className="lg:col-span-7">
                <div className="mb-5 sm:mb-6">
                  <h2 className="font-semibold text-base text-primary-text sm:text-lg">Fixtures</h2>
                  <p className="mt-1.5 text-sm text-secondary-text">
                    Enter scores when a match is open for predictions.
                  </p>
                </div>
                <FixturesFromSupabase />
              </section>

              <section className="lg:col-span-5">
                <LeaderboardTable />
              </section>
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
