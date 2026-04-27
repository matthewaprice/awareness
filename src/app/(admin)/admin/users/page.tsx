"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { listUsers, updateUserStatus, updateUserRole } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SessionWithRole, UserSummary, Role } from "@/types";

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const typedSession = session as unknown as SessionWithRole | null;

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "status" | "role";
    userId: string;
    userName: string;
    value: boolean | Role;
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsers({
        search: search || undefined,
        page,
        pageSize: 10,
      });
      setUsers(result.data);
      setTotalPages(result.totalPages);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated" && typedSession?.user?.role !== "ADMIN") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const result = await listUsers({
            search: search || undefined,
            page,
            pageSize: 10,
          });
          if (!cancelled) {
            setUsers(result.data);
            setTotalPages(result.totalPages);
          }
        } catch {
          // silently fail
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }
  }, [status, typedSession, search, page, router]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  }

  function requestStatusChange(user: UserSummary) {
    setConfirmAction({
      type: "status",
      userId: user.id,
      userName: user.fullName,
      value: !user.active,
    });
    setConfirmOpen(true);
  }

  function requestRoleChange(user: UserSummary, newRole: Role) {
    setConfirmAction({
      type: "role",
      userId: user.id,
      userName: user.fullName,
      value: newRole,
    });
    setConfirmOpen(true);
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "status") {
        await updateUserStatus(confirmAction.userId, confirmAction.value as boolean);
      } else {
        await updateUserRole(confirmAction.userId, confirmAction.value as Role);
      }
      await fetchUsers();
    } catch {
      // silently fail
    } finally {
      setConfirmOpen(false);
      setConfirmAction(null);
    }
  }

  if (status === "loading") {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground">
          View, search, and manage user accounts.
        </p>
      </div>

      <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {loading ? (
        <p className="text-muted-foreground">Loading users…</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.fullName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(val) => requestRoleChange(user, val as Role)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PATIENT">Patient</SelectItem>
                          <SelectItem value="PHYSICIAN">Physician</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "default" : "secondary"}>
                        {user.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={user.active ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => requestStatusChange(user)}
                      >
                        {user.active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Confirmation Dialog (Req 7.7) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "status"
                ? `Are you sure you want to ${confirmAction.value ? "activate" : "deactivate"} ${confirmAction.userName}?`
                : `Are you sure you want to change ${confirmAction?.userName}'s role to ${confirmAction?.value}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "status" && !confirmAction.value ? "destructive" : "default"}
              onClick={executeConfirmedAction}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
