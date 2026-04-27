"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  reviewPhysicianProfile,
  removePhysicianProfile,
  listAllPhysicianProfiles,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
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
import type { SessionWithRole } from "@/types";

type PhysicianRow = {
  id: string;
  userId: string;
  credentials: string;
  specialty: string;
  practiceName: string;
  practiceAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website: string | null;
  active: boolean;
  approved: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { fullName: string; email: string };
};

export default function AdminPhysiciansPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const typedSession = session as unknown as SessionWithRole | null;

  const [profiles, setProfiles] = useState<PhysicianRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Confirm dialog for remove
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProfile, setConfirmProfile] = useState<PhysicianRow | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAllPhysicianProfiles();
      setProfiles(data as unknown as PhysicianRow[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

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
          const data = await listAllPhysicianProfiles();
          if (!cancelled) setProfiles(data as unknown as PhysicianRow[]);
        } catch {
          // silently fail
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }
  }, [status, typedSession, router]);

  async function handleApprove(profile: PhysicianRow) {
    try {
      await reviewPhysicianProfile(profile.id, !profile.approved);
      await fetchProfiles();
    } catch {
      // silently fail
    }
  }

  function requestRemove(profile: PhysicianRow) {
    setConfirmProfile(profile);
    setConfirmOpen(true);
  }

  async function executeRemove() {
    if (!confirmProfile) return;
    try {
      await removePhysicianProfile(confirmProfile.id);
      await fetchProfiles();
    } catch {
      // silently fail
    } finally {
      setConfirmOpen(false);
      setConfirmProfile(null);
    }
  }

  if (status === "loading") {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Physician Registry Management</h1>
        <p className="text-sm text-muted-foreground">
          Review, approve, and manage physician profiles.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading profiles…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No physician profiles found.
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{profile.user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{profile.credentials}</p>
                    </div>
                  </TableCell>
                  <TableCell>{profile.specialty}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {profile.city}, {profile.state}
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.active ? "default" : "secondary"}>
                      {profile.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.approved ? "default" : "outline"}>
                      {profile.approved ? "Approved" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={profile.approved ? "secondary" : "default"}
                        onClick={() => handleApprove(profile)}
                      >
                        {profile.approved ? "Revoke" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => requestRemove(profile)}
                      >
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Remove Confirmation Dialog (Req 7.7) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Physician Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {confirmProfile?.user.fullName}&apos;s physician profile? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={executeRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
