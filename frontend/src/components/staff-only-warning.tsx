"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const PORTAL_NAME: Record<string, { en: string; ar: string }> = {
  REP: { en: "Rep Portal", ar: "بوابة المندوب" },
  DRIVER: { en: "Driver Portal", ar: "بوابة السائق" },
  SUPPLIER: { en: "Supplier Portal", ar: "بوابة المورد" },
};

/**
 * Shown when a portal user (rep / driver / supplier) opens a staff-only
 * /dashboard link. Nothing from the dashboard is rendered; it tells them this
 * area is not for them and gives them their own portal's address.
 */
export function StaffOnlyWarning({ role, home }: { role: string; home: string }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const portalUrl = `${origin}${home}`;
  const name = PORTAL_NAME[role] ?? { en: "your portal", ar: "بوابتك" };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-amber-300 bg-card p-6 shadow-lg dark:border-amber-700">
        <div className="mb-4 flex items-center gap-3 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-8 w-8 shrink-0" />
          <h1 className="text-lg font-semibold">Access not allowed</h1>
        </div>

        <p className="text-sm text-foreground">
          This page is for office staff only. You received a wrong link.
          Please always use the {name.en} link below.
        </p>
        <p dir="rtl" className="mt-3 text-sm text-foreground">
          هذه الصفحة مخصصة لموظفي المكتب فقط، والرابط الذي وصلك غير صحيح.
          برجاء استخدام رابط {name.ar} التالي دائمًا.
        </p>

        <div className="mt-5 rounded-lg border border-border bg-muted/50 p-3">
          <div className="text-xs text-muted-foreground">Your correct link · الرابط الصحيح</div>
          <a href={home} className="mt-1 block break-all font-mono text-sm font-medium text-primary hover:underline">
            {portalUrl || home}
          </a>
        </div>

        <Button className="mt-5 w-full" onClick={() => window.location.replace(home)}>
          Go to {name.en} · الذهاب إلى {name.ar}
        </Button>
      </div>
    </div>
  );
}
