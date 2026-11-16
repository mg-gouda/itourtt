"use client";

import { TrackingView } from "@/components/tracking/tracking-view";

/** Driver Tracking — every active driver at their last-known position. */
export default function DriverTrackingPage() {
  return <TrackingView kind="driver" />;
}
