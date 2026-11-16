"use client";

import { TrackingView } from "@/components/tracking/tracking-view";

/** Overall Tracking — every active rep and driver on one map. */
export default function OverallTrackingPage() {
  return <TrackingView kind="all" />;
}
