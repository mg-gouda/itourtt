"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useCompanyStore } from "@/stores/company-store";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, hydrate } = useAuthStore();
  const { loadCompanySettings } = useCompanyStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  useEffect(() => {
    if (mounted && isAuthenticated) {
      loadCompanySettings();
    }
  }, [mounted, isAuthenticated, loadCompanySettings]);

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-3 pb-10 md:p-6 md:pb-10">{children}</main>
          <footer className="shrink-0 border-t border-border bg-gray-500/15 px-3 md:px-6 py-1.5 text-right text-[11px] text-foreground">
            Developed by: <a href="https://wa.me/+201002805139" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Mohamed Gouda</a> &middot; v{process.env.NEXT_PUBLIC_APP_VERSION}
          </footer>
        </div>
      </div>
    </ThemeProvider>
  );
}
