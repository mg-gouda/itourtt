"use client";

import { Star } from "lucide-react";
import { useT } from "@/lib/i18n";

/** Review tab (6.8.0): placeholder until guest reviews are built. */
export default function ReviewComingSoonPage() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15">
        <Star className="h-9 w-9 text-primary" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-xl font-bold text-foreground">{t("portal.reviewTitle")}</h1>
      <span className="mt-2 rounded-full bg-muted px-3 py-1 text-xs font-bold tracking-wide text-muted-foreground">{t("portal.comingSoon")}</span>
      <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t("portal.reviewSoonBody")}</p>
    </div>
  );
}
