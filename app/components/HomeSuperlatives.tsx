"use client";

import { useEffect, useState } from "react";
import { Superlatives } from "@/app/components/Superlatives";
import type { FunAward, FunFact } from "@/lib/predictionStats";

export function HomeSuperlatives() {
  const [awards, setAwards] = useState<FunAward[]>([]);
  const [facts, setFacts] = useState<FunFact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/stats", { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { ok: true; awards: FunAward[]; facts: FunFact[] }
        | { ok: false; message: string }
        | null;

      if (!res || !json || !json.ok) {
        setAwards([]);
        setFacts([]);
        setLoading(false);
        return;
      }

      setAwards(json.awards ?? []);
      setFacts(json.facts ?? []);
      setLoading(false);
    }

    void load();
    const onChange = () => void load();
    window.addEventListener("wc:predictions-changed", onChange);
    return () => window.removeEventListener("wc:predictions-changed", onChange);
  }, []);

  return <Superlatives awards={awards} facts={facts} loading={loading} showStatsLink />;
}
