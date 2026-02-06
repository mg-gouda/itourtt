"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Briefcase,
  MapPin,
  Car,
  Users,
  UserCheck,
  Building2,
  Truck,
  DollarSign,
  BarChart3,
  Plane,
  Settings2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Palette,
  Building,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavLink {
  type: "link";
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavSeparator {
  type: "separator";
}

interface NavGroup {
  type: "group";
  name: string;
  icon: React.ElementType;
  children: NavLink[];
}

type NavItem = NavLink | NavSeparator | NavGroup;

const navigation: NavItem[] = [
  { type: "link", name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { type: "link", name: "Dispatch", href: "/dashboard/dispatch", icon: CalendarClock },
  { type: "link", name: "Traffic Jobs", href: "/dashboard/traffic-jobs", icon: Briefcase },
  { type: "separator" },
  { type: "link", name: "Finance", href: "/dashboard/finance", icon: DollarSign },
  { type: "link", name: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { type: "separator" },
  {
    type: "group",
    name: "System Parameters",
    icon: Settings2,
    children: [
      { type: "link", name: "Locations", href: "/dashboard/locations", icon: MapPin },
      { type: "link", name: "Vehicles", href: "/dashboard/vehicles", icon: Car },
      { type: "link", name: "Drivers", href: "/dashboard/drivers", icon: Users },
      { type: "link", name: "Reps", href: "/dashboard/reps", icon: UserCheck },
      { type: "link", name: "Agents", href: "/dashboard/agents", icon: Building2 },
      { type: "link", name: "Customers", href: "/dashboard/customers", icon: Users },
      { type: "link", name: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
      { type: "link", name: "Styling", href: "/dashboard/styling", icon: Palette },
      { type: "link", name: "Company", href: "/dashboard/company", icon: Building },
      { type: "link", name: "Users", href: "/dashboard/users", icon: ShieldCheck },
    ],
  },
];

const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of navigation) {
      if (item.type === "group") {
        const childActive = item.children.some((c) =>
          pathname.startsWith(c.href)
        );
        if (childActive) initial[item.name] = true;
      }
    }
    return initial;
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const toggleGroup = (name: string) => {
    if (collapsed) {
      // Expand sidebar first, then open the group
      setCollapsed(false);
      localStorage.setItem(STORAGE_KEY, "false");
      setGroupOpen((prev) => ({ ...prev, [name]: true }));
      return;
    }
    setGroupOpen((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "w-[60px]" : "w-60"
        )}
      >
        {/* Brand */}
        <div className={cn("flex h-14 items-center gap-2", collapsed ? "justify-center px-0" : "px-4")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
            <Plane className="h-4 w-4 text-sidebar-foreground" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-sidebar-foreground whitespace-nowrap overflow-hidden">
              iTour TT
            </span>
          )}
        </div>
        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className={cn("flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden", collapsed ? "p-1.5" : "p-2")}>
          {navigation.map((item, i) => {
            if (item.type === "separator") {
              return <Separator key={i} className="my-2 bg-sidebar-border" />;
            }

            if (item.type === "group") {
              const isOpen = !!groupOpen[item.name] && !collapsed;
              const Icon = item.icon;
              const hasActiveChild = item.children.some((c) =>
                pathname.startsWith(c.href)
              );

              return (
                <div key={item.name}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => toggleGroup(item.name)}
                        className={cn(
                          "flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                          collapsed
                            ? "justify-center px-0 py-2"
                            : "gap-2.5 px-3 py-2",
                          hasActiveChild
                            ? "text-sidebar-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left whitespace-nowrap overflow-hidden">{item.name}</span>
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 text-sidebar-foreground/40 transition-transform duration-150",
                                isOpen && "rotate-90"
                              )}
                            />
                          </>
                        )}
                      </button>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right" sideOffset={8}>
                        {item.name}
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {isOpen && (
                    <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const isActive = pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap overflow-hidden",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Regular link
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-colors",
                      collapsed
                        ? "justify-center px-0 py-2"
                        : "gap-2.5 px-3 py-2",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="whitespace-nowrap overflow-hidden">{item.name}</span>
                    )}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" sideOffset={8}>
                    {item.name}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <Separator className="bg-sidebar-border" />
        <div className={cn("flex items-center", collapsed ? "justify-center p-2" : "justify-end px-3 py-2")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapsed}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                {collapsed ? (
                  <ChevronsRight className="h-4 w-4" />
                ) : (
                  <ChevronsLeft className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
