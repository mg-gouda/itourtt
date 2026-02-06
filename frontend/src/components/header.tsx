"use client";

import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  DISPATCHER: "Dispatcher",
  ACCOUNTANT: "Accountant",
  AGENT_MANAGER: "Agent Manager",
  VIEWER: "Viewer",
};

export function Header() {
  const { user, logout } = useAuthStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        {user && (
          <Badge variant="outline" className="border-border text-muted-foreground">
            {roleLabels[user.role] || user.role}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <User className="h-4 w-4" />
              <span className="text-sm">{user?.name || "User"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 border-border bg-popover text-popover-foreground"
          >
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {user?.email}
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-red-400 focus:bg-accent focus:text-red-400"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
