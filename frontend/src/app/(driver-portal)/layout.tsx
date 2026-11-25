"use client";

import { PortalLayout } from "@/components/portal/portal-shell";

export default function DriverPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout kind="driver">{children}</PortalLayout>;
}
