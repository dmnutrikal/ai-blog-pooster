"use client";

// While a sync job runs, re-fetch the server component every few seconds so the
// job counters and coverage table stay live without a manual reload.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
