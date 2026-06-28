import { TopBar } from "@/app/components/TopBar";
import { AdminResults } from "@/app/components/admin/AdminResults";
import { RequireAuth } from "@/app/components/RequireAuth";

export default function AdminPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-secondary-50 font-sans text-primary-text">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-6">
            <h1 className="font-semibold text-xl tracking-tight sm:text-2xl">Admin</h1>
            <p className="mt-1 text-sm text-secondary-text">
              Enter match results, update knockout team names, and correct finished scores.
            </p>
          </div>
          <AdminResults />
        </main>
      </div>
    </RequireAuth>
  );
}
