"use client";

import { PortalLayout } from "@/components/portal/portal-shell";

export default function RepPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout kind="rep">{children}</PortalLayout>;
}
