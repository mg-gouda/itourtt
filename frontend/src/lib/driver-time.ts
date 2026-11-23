// Driver Time (5.8.0): when the driver must be ready for a job — always 1 hour before the job's
// time (arrival, departure or any other job). Shown on Dispatch and Traffic Cover, never stored:
// it follows the job time whenever that changes. Business rules › Driver Time.

export const DRIVER_LEAD_MINUTES = 60;

/** "HH:MM" → the same clock time minus the lead (wraps past midnight: "00:30" → "23:30"). */
export function driverTimeFromHHMM(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return "";
  const total = (((Number(m[1]) * 60 + Number(m[2]) - DRIVER_LEAD_MINUTES) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A job instant → the driver's ready instant. */
export function driverTimeFromDate(at: Date | null | undefined): Date | null {
  return at ? new Date(at.getTime() - DRIVER_LEAD_MINUTES * 60_000) : null;
}
