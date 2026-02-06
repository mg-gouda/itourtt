"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { ThemeProvider } from "@/components/theme-provider";
import {
  Plane,
  Briefcase,
  History,
  Bell,
  LogOut,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";

export default function RepPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, hydrate, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
    if (mounted && isAuthenticated && user?.role !== "REP") {
      router.replace("/dashboard");
    }
  }, [mounted, isAuthenticated, user, router]);

  // Fetch unread notification count
  useEffect(() => {
    if (!mounted || !isAuthenticated || user?.role !== "REP") return;

    const fetchUnread = async () => {
      try {
        const { data } = await api.get("/rep-portal/notifications");
        setUnreadCount(data.data?.unreadCount ?? 0);
      } catch {
        // ignore
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [mounted, isAuthenticated, user]);

  if (!mounted || !isAuthenticated || user?.role !== "REP") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
      </div>
    );
  }

  const navLinks = [
    { href: "/rep", label: "My Jobs", icon: Briefcase, exact: true },
    { href: "/rep/history", label: "History", icon: History },
  ];

  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col bg-background">
        {/* Top navigation bar */}
        <header className="sticky top-0 z-50 border-b border-border bg-card">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            {/* Brand */}
            <div className="flex items-center gap-6">
              <Link href="/rep" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Plane className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-semibold text-foreground">
                  iTour TT
                </span>
              </Link>

              {/* Nav links */}
              <nav className="flex items-center gap-1">
                {navLinks.map((link) => {
                  const isActive = link.exact
                    ? pathname === link.href
                    : pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                      }`}
                    >
                      <link.icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Notification bell */}
              <Link href="/rep#notifications">
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button>
              </Link>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden text-sm sm:inline">
                      {user.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
