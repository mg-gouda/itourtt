"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Job type for drivers / reps: where the booking came from (TrafficJob.bookingChannel).
 * ONLINE = tour-operator online jobs, B2B = business customers, B2C = public-site booking.
 * Colours follow the owner palette in light mode (navy / orange / green) and soft tints in dark.
 */
const STYLE: Record<string, string> = {
  ONLINE: "border-transparent bg-[#1C2B5A] text-white dark:bg-indigo-500/20 dark:text-indigo-200",
  B2B: "border-transparent bg-[#FF7A1A] text-black dark:bg-orange-500/20 dark:text-orange-200",
  B2C: "border-transparent bg-emerald-700 text-white dark:bg-emerald-500/20 dark:text-emerald-200",
};

export function BookingChannelBadge({ channel, className }: { channel?: string | null; className?: string }) {
  const t = useT();
  if (!channel || !STYLE[channel]) return null;
  return (
    <Badge className={cn("text-[11px] font-semibold", STYLE[channel], className)} title={t(`bookingChannel.${channel}.hint`)}>
      {t(`bookingChannel.${channel}`)}
    </Badge>
  );
}
