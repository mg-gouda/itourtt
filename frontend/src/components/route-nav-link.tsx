"use client";

import type { ReactNode } from "react";
import { Navigation } from "lucide-react";
import { jobNavUrl, type NavJob, type RouteEnd } from "@/lib/maps-nav";

/**
 * A job's origin or destination as a tap-to-navigate link: opens the Google
 * Maps app with the route set and navigation started. Renders plain text when
 * the location can't be resolved to anywhere. Stops click propagation so a tap
 * on the link never also opens the job card it sits in.
 */
export function RouteNavLink({
  job,
  end,
  children,
}: {
  job: NavJob;
  end: RouteEnd;
  children: ReactNode;
}) {
  const href = jobNavUrl(job, end);
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Navigate with Google Maps"
      className="inline-flex items-center gap-0.5 font-medium text-sky-500 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-400 active:text-sky-600"
    >
      {children}
      <Navigation className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}
