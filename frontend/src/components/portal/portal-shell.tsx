"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { homeForRole } from "@/lib/role-home";
import { ThemeProvider } from "@/components/theme-provider";
import { LicenseGate } from "@/components/license-gate";
import { Plane, Truck, Bell, History, MessageCircle, MessageSquareWarning, User, Route } from "lucide-react";
import api, { backgroundPoll } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useChatMe } from "@/lib/chat";
import { PushPrompt } from "@/components/push-prompt";
import { useT } from "@/lib/i18n";
import { useLocationHeartbeat } from "@/lib/use-location-heartbeat";
import { JobAlarms } from "@/components/job-alarms";
import { AlarmSoundGate, playOnce } from "@/lib/alarm-sound";
import { ChatSoundWatcher } from "@/lib/chat-sound";

type PortalKind = "rep" | "driver";

/**
 * Shared frame of the rep and driver web portals (they were two 200-line copies).
 * UI review 1d: five tabs with 12px labels — History · Chat · [Jobs] · Complaints ·
 * Profile — with Jobs as the larger raised button in the centre (route icon).
 * Log out moved into Profile, behind a confirmation.
 */
export function PortalLayout({ kind, children }: { kind: PortalKind; children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, hydrate } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const role = kind === "rep" ? "REP" : "DRIVER";

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace("/login");
    if (mounted && isAuthenticated && user?.role !== role) router.replace(homeForRole(user?.role) ?? "/login");
  }, [mounted, isAuthenticated, user, router, role]);

  if (!mounted || !isAuthenticated || user?.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <LicenseGate audience="field">
        <PortalShell kind={kind} user={user}>{children}</PortalShell>
      </LicenseGate>
    </ThemeProvider>
  );
}

function PortalShell({ kind, user, children }: { kind: PortalKind; user: { name: string; role: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const base = `/${kind}`;
  const [unreadCount, setUnreadCount] = useState(0);
  const lastUnread = useRef<number | null>(null);
  useLocationHeartbeat();
  const { me: chat } = useChatMe();
  const chatUnread = chat?.unreadTotal ?? 0;

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await api.get(`/${kind}-portal/notifications`, backgroundPoll);
        const n = data.data?.unreadCount ?? 0;
        // A new notification since the last poll rings once (job assigned / changed / cancelled…).
        if (lastUnread.current !== null && n > lastUnread.current) playOnce();
        lastUnread.current = n;
        setUnreadCount(n);
      } catch {
        // ignore
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [kind]);

  const side = (href: string, label: string, Icon: typeof History, badge = 0) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-12 flex-1 flex-col items-center justify-center gap-1 py-1.5 text-xs font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground active:text-foreground",
        )}
      >
        <span className="relative">
          <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
          {badge > 0 && (
            <span className="absolute -end-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-destructive-foreground">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        {label}
      </Link>
    );
  };

  const jobsActive = pathname === base;
  const BrandIcon = kind === "rep" ? Plane : Truck;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ChatSoundWatcher unread={chatUnread} />
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="flex h-12 items-center justify-between px-4">
          <Link href={base} className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <BrandIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-foreground">{t("sidebar.brand")}</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href={`${base}#notifications`}
              aria-label={t("portal.notifications")}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-muted"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <span className="max-w-[110px] truncate text-xs text-muted-foreground">{user.name}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        <PushPrompt />
        {children}
        {/* Start reminders + drop-off geofence alarms (must be acknowledged) */}
        <JobAlarms portal={kind} />
        <AlarmSoundGate />
        {/* Credit line sits at the end of the page now — fixed, it ran under the raised Jobs button. */}
        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Developed by: <a href="https://wa.me/+201002805139" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Mohamed Gouda</a> &middot; v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </main>

      <nav aria-label="Main" className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
        <div className="relative flex h-[68px] items-stretch justify-around">
          {side(`${base}/history`, t("portal.history"), History)}
          {side(`${base}/chat`, t("portal.chat"), MessageCircle, chatUnread)}
          <Link
            href={base}
            aria-current={jobsActive ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center justify-end pb-1.5 text-xs font-bold", jobsActive ? "text-primary" : "text-foreground")}
          >
            <span
              className={cn(
                "absolute -top-6 flex h-[62px] w-[62px] items-center justify-center rounded-full border-4 border-background shadow-md transition-transform active:scale-95",
                jobsActive ? "bg-primary text-primary-foreground" : "bg-primary/90 text-primary-foreground",
              )}
            >
              <Route className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
            </span>
            {t("portal.jobs")}
          </Link>
          {side(`${base}/complaints`, t("portal.complaints"), MessageSquareWarning)}
          {side(`${base}/profile`, t("portal.profile"), User)}
        </div>
      </nav>
    </div>
  );
}
