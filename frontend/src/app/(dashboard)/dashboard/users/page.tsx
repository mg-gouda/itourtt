"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import {
  Shield,
  CalendarClock,
  DollarSign,
  Building2,
  Eye,
  Plus,
  Loader2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────
type UserRole = "ADMIN" | "DISPATCHER" | "ACCOUNTANT" | "AGENT_MANAGER" | "VIEWER";

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

interface RolePermission {
  id?: string;
  role: UserRole;
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ─── Constants ──────────────────────────────────────────────────
const ROLES: UserRole[] = ["ADMIN", "DISPATCHER", "ACCOUNTANT", "AGENT_MANAGER", "VIEWER"];

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  DISPATCHER: "Dispatcher",
  ACCOUNTANT: "Accountant",
  AGENT_MANAGER: "Agent Mgr",
  VIEWER: "Viewer",
};

const MODULES = [
  "dashboard",
  "dispatch",
  "traffic-jobs",
  "finance",
  "reports",
  "locations",
  "vehicles",
  "drivers",
  "reps",
  "agents",
  "suppliers",
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  dispatch: "Dispatch",
  "traffic-jobs": "Traffic Jobs",
  finance: "Finance",
  reports: "Reports",
  locations: "Locations",
  vehicles: "Vehicles",
  drivers: "Drivers",
  reps: "Reps",
  agents: "Agents",
  suppliers: "Suppliers",
};

const ROLE_DESCRIPTIONS: Record<UserRole, { icon: React.ElementType; description: string }> = {
  ADMIN: {
    icon: Shield,
    description:
      "Full system access. Can manage all modules, users, settings, and permissions.",
  },
  DISPATCHER: {
    icon: CalendarClock,
    description:
      "Manages daily dispatch operations, assigns vehicles, drivers, and reps to traffic jobs.",
  },
  ACCOUNTANT: {
    icon: DollarSign,
    description:
      "Handles financial operations, invoicing, payments, and generates financial reports.",
  },
  AGENT_MANAGER: {
    icon: Building2,
    description:
      "Manages travel agent relationships, traffic job bookings, and agent communications.",
  },
  VIEWER: {
    icon: Eye,
    description:
      "Read-only access to all modules. Cannot create, edit, or delete any records.",
  },
};

// ─── Main Page ──────────────────────────────────────────────────
export default function UsersPage() {
  const [activeTab, setActiveTab] = useState("users");

  // ─── Users tab state ──────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("VIEWER");
  const [submitting, setSubmitting] = useState(false);

  // ─── Permissions tab state ────────────────────────────────────
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  // ─── Fetch users ──────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const { data } = await api.get("/users?limit=100");
      setUsers(Array.isArray(data.data) ? data.data : []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ─── Fetch permissions ────────────────────────────────────────
  const fetchPermissions = useCallback(async () => {
    setPermsLoading(true);
    try {
      const { data } = await api.get("/users/permissions");
      setPermissions(Array.isArray(data) ? data : []);
    } catch {
      // permissions not seeded yet, that's OK
      setPermissions([]);
    } finally {
      setPermsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (activeTab === "permissions") {
      fetchPermissions();
    }
  }, [activeTab, fetchPermissions]);

  // ─── Create user ──────────────────────────────────────────────
  async function handleCreate() {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error("All fields are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/users", {
        name: formName.trim(),
        email: formEmail.trim(),
        password: formPassword.trim(),
        role: formRole,
      });
      toast.success("User created");
      setAddDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to create user";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Edit user ────────────────────────────────────────────────
  function openEdit(user: User) {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormRole(user.role);
    setEditDialogOpen(true);
  }

  async function handleEdit() {
    if (!editingUser) return;
    setSubmitting(true);
    try {
      // Update name/email
      await api.patch(`/users/${editingUser.id}`, {
        name: formName.trim(),
        email: formEmail.trim(),
      });
      // Update role if changed
      if (formRole !== editingUser.role) {
        await api.patch(`/users/${editingUser.id}/role`, { role: formRole });
      }
      toast.success("User updated");
      setEditDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to update user";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Deactivate user ─────────────────────────────────────────
  async function handleDeactivate(id: string) {
    try {
      await api.delete(`/users/${id}`);
      toast.success("User deactivated");
      fetchUsers();
    } catch {
      toast.error("Failed to deactivate user");
    }
  }

  // ─── Permission helpers ───────────────────────────────────────
  function getPermission(role: UserRole, module: string): RolePermission {
    return (
      permissions.find((p) => p.role === role && p.module === module) ?? {
        role,
        module,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      }
    );
  }

  function togglePermission(
    role: UserRole,
    module: string,
    field: "canView" | "canCreate" | "canEdit" | "canDelete"
  ) {
    setPermissions((prev) => {
      const idx = prev.findIndex((p) => p.role === role && p.module === module);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], [field]: !updated[idx][field] };
        return updated;
      }
      return [
        ...prev,
        { role, module, canView: false, canCreate: false, canEdit: false, canDelete: false, [field]: true },
      ];
    });
  }

  async function handleSavePermissions() {
    setPermsSaving(true);
    try {
      // Build full matrix
      const matrix: RolePermission[] = [];
      for (const role of ROLES) {
        for (const mod of MODULES) {
          const p = getPermission(role, mod);
          matrix.push({
            role,
            module: mod,
            canView: p.canView,
            canCreate: p.canCreate,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
          });
        }
      }
      await api.put("/users/permissions", { permissions: matrix });
      toast.success("Permissions saved");
    } catch {
      toast.error("Failed to save permissions");
    } finally {
      setPermsSaving(false);
    }
  }

  async function handleSeedDefaults() {
    try {
      await api.get("/users/permissions/seed");
      toast.success("Default permissions seeded");
      fetchPermissions();
    } catch {
      toast.error("Failed to seed defaults");
    }
  }

  function resetForm() {
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("VIEWER");
    setEditingUser(null);
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage users, roles, and access permissions"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="border-border bg-muted">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
          <TabsTrigger value="roles">User Roles</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Users ─────────────────────────────────────── */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              System users and their assigned roles.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                resetForm();
                setAddDialogOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </div>

          <Card className="border-border bg-card">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="mb-2 h-8 w-8" />
                <p className="text-sm">No users found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Role</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Created</TableHead>
                    <TableHead className="text-right text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="border-border hover:bg-muted/50"
                    >
                      <TableCell className="font-medium text-foreground">
                        {user.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                        >
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-600 dark:text-red-400">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </Button>
                        {user.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500/70 hover:text-red-500"
                            onClick={() => handleDeactivate(user.id)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Permission Matrix ─────────────────────────── */}
        <TabsContent value="permissions" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Configure what each role can access across modules.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedDefaults}
              >
                Seed Defaults
              </Button>
              <Button
                size="sm"
                disabled={permsSaving}
                onClick={handleSavePermissions}
                className="gap-1.5"
              >
                {permsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Permissions
              </Button>
            </div>
          </div>

          <Card className="border-border bg-card p-0">
            {permsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                        Module
                      </th>
                      {ROLES.map((role) => (
                        <th
                          key={role}
                          colSpan={4}
                          className="border-l border-border px-2 py-3 text-center text-xs font-medium text-muted-foreground"
                        >
                          {ROLE_LABELS[role]}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-border">
                      <th className="sticky left-0 z-10 bg-card px-4 py-1" />
                      {ROLES.map((role) => (
                        <Fragment key={role}>
                          {(["V", "C", "E", "D"] as const).map((lbl) => (
                            <th
                              key={`${role}-${lbl}`}
                              className={`px-1 py-1 text-center text-[10px] font-normal text-muted-foreground/60 ${lbl === "V" ? "border-l border-border" : ""}`}
                            >
                              {lbl}
                            </th>
                          ))}
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((mod) => (
                      <tr
                        key={mod}
                        className="border-b border-border/50 hover:bg-muted/50"
                      >
                        <td className="sticky left-0 z-10 bg-card px-4 py-2 text-foreground/70">
                          {MODULE_LABELS[mod]}
                        </td>
                        {ROLES.map((role) => {
                          const perm = getPermission(role, mod);
                          const isAdmin = role === "ADMIN";
                          return (
                            <Fragment key={role}>
                              {(
                                [
                                  "canView",
                                  "canCreate",
                                  "canEdit",
                                  "canDelete",
                                ] as const
                              ).map((field, fi) => (
                                <td
                                  key={`${role}-${mod}-${field}`}
                                  className={`px-1 py-2 text-center ${fi === 0 ? "border-l border-border" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isAdmin ? true : perm[field]}
                                    disabled={isAdmin}
                                    onChange={() =>
                                      togglePermission(role, mod, field)
                                    }
                                    className="h-3.5 w-3.5 cursor-pointer rounded accent-primary disabled:cursor-default disabled:opacity-40"
                                  />
                                </td>
                              ))}
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ─── Tab 3: User Roles ────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Reference guide for the five system roles and their access levels.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((role) => {
              const { icon: Icon, description } = ROLE_DESCRIPTIONS[role];
              return (
                <Card
                  key={role}
                  className="border-border bg-card p-6"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-foreground">
                        {ROLE_LABELS[role]}
                      </h4>
                      <Badge
                        variant="secondary"
                        className="mt-0.5 text-[10px]"
                      >
                        {role}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Add User Dialog ─────────────────────────────────────── */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-foreground/70">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Email</Label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="user@example.com"
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Password</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Role</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as UserRole)}
              >
                <SelectTrigger className="border-border bg-muted/50 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-popover-foreground">
                  {ROLES.map((r) => (
                    <SelectItem
                      key={r}
                      value={r}
                      className="focus:bg-accent focus:text-accent-foreground"
                    >
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAddDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit User Dialog ────────────────────────────────────── */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-foreground/70">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Email</Label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/70">Role</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as UserRole)}
              >
                <SelectTrigger className="border-border bg-muted/50 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-popover-foreground">
                  {ROLES.map((r) => (
                    <SelectItem
                      key={r}
                      value={r}
                      className="focus:bg-accent focus:text-accent-foreground"
                    >
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
