"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { logoutUser } from "@/actions/auth";
import { Button } from "@/components/ui/button";

interface LogoutButtonProps {
  /** Optional className override for the button */
  className?: string;
  /** Optional variant for the shadcn Button */
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

/**
 * Reusable logout button that:
 * 1. Invalidates the Redis session via server action
 * 2. Calls NextAuth signOut() to clear the JWT cookie
 * 3. Redirects to the home page
 *
 * Requirement 1.7
 */
export function LogoutButton({ className, variant = "outline" }: LogoutButtonProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      // Step 1: Invalidate Redis session
      const userId = (session?.user as { id?: string })?.id;
      if (userId) {
        await logoutUser(userId);
      }

      // Step 2: Sign out via NextAuth (clears JWT cookie) and redirect to home
      await signOut({ callbackUrl: "/" });
    } catch {
      // Even if Redis invalidation fails, still sign out the client
      await signOut({ callbackUrl: "/" });
    }
  }

  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleLogout}
      disabled={loading}
      aria-label="Log out"
    >
      {loading ? "Logging out…" : "Log out"}
    </Button>
  );
}
