"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import clarosLogo from "@/app/0c434f79-be5c-460c-a2fa-438da3806f93.webp";
import { FavoriteTeamPicker } from "@/app/components/FavoriteTeamPicker";
import { PredictionHistoryButton } from "@/app/components/PredictionHistoryButton";
import { useAuth } from "@/app/components/AuthProvider";

export function TopBar() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await signOut();
    setBusy(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-secondary-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8 lg:px-10">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Image
            src={clarosLogo}
            alt="Claros Analytics"
            width={140}
            height={36}
            className="h-7 w-auto max-w-[7rem] shrink-0 object-contain object-left sm:h-8 sm:max-w-[8rem]"
            priority
          />
          <div className="min-w-0">
            <div className="truncate font-semibold text-sm tracking-tight text-primary-text sm:text-base">
              Claros WC26 Prediction
            </div>
            {user ? (
              <div className="truncate text-xs text-secondary-text">
                {user.username ? `@${user.username}` : (user.email ?? "Signed in")}
              </div>
            ) : null}
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <FavoriteTeamPicker />
          <PredictionHistoryButton />

          <Link
            href="/stats"
            className="inline-flex h-8 items-center justify-center rounded-full border border-secondary-border bg-background px-3 text-xs text-primary-text transition-colors hover:bg-secondary-50"
          >
            Stats
          </Link>

          {user?.isAdmin ? (
            <Link
              href="/admin"
              className="hidden h-8 items-center justify-center rounded-full border border-secondary-border bg-background px-3 text-xs text-primary-text transition-colors hover:bg-secondary-50 sm:inline-flex"
            >
              Admin
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy}
            className="inline-flex h-8 items-center justify-center rounded-full border border-secondary-border bg-background px-3.5 text-xs text-primary-text transition-colors hover:bg-secondary-50 disabled:opacity-60"
          >
            {busy ? "…" : "Logout"}
          </button>
        </div>
      </div>
    </header>
  );
}
