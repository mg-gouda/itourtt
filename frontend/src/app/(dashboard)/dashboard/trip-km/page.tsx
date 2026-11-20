"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Gauge } from "lucide-react";
import { TripKmTable } from "@/components/trip-km-table";

/** Fleet › Trip Kilometers: every owned car's odometer readings, checks and the Odoo export. */
function TripKmPageBody() {
  const sp = useSearchParams();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Gauge className="h-6 w-6" />
          Trip Kilometers
        </h1>
        <p className="text-sm text-muted-foreground">
          Odometer readings drivers take when completing jobs in owned cars — check them and export to Odoo.
        </p>
      </div>
      <TripKmTable initialFrom={sp.get("from") ?? undefined} initialTo={sp.get("to") ?? undefined} />
    </div>
  );
}

export default function TripKmPage() {
  return (
    <Suspense>
      <TripKmPageBody />
    </Suspense>
  );
}
