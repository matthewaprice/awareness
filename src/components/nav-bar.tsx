"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogoutButton } from "@/components/auth/logout-button";

const publicLinks = [
  { href: "/about", label: "About" },
  { href: "/research", label: "Research" },
  { href: "/faq", label: "FAQs" },
  { href: "/find-a-doctor", label: "Find a Doctor" },
  { href: "/statistics", label: "Statistics" },
];

function roleLinks(role: string | undefined) {
  switch (role) {
    case "PATIENT":
      return [{ href: "/surveys", label: "My Surveys" }];
    case "PHYSICIAN":
      return [{ href: "/registry/profile", label: "My Profile" }];
    case "ADMIN":
      return [{ href: "/admin/dashboard", label: "Admin" }];
    default:
      return [];
  }
}

export function NavBar() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  const user = session?.user as
    | { id?: string; role?: string; name?: string }
    | undefined;
  const authenticated = status === "authenticated" && !!user;
  const links = [...publicLinks, ...roleLinks(user?.role)];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav
        aria-label="Main navigation"
        className="container mx-auto flex h-14 items-center justify-between px-4"
      >
        {/* Logo / Home — fixed width to balance with auth section */}
        <div className="hidden md:flex flex-1">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight"
            aria-label="Home"
          >
            IIH Info
          </Link>
        </div>
        {/* Mobile logo — no flex-1 needed */}
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight md:hidden"
          aria-label="Home"
        >
          IIH Info
        </Link>

        {/* Desktop links — centered */}
        <ul className="hidden md:flex items-center gap-1 shrink-0" role="list">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop auth — fixed width to balance with logo section */}
        <div className="hidden md:flex flex-1 items-center justify-end gap-2">
          {authenticated ? (
            <>
              <span className="text-sm text-muted-foreground">
                {user?.name}
              </span>
              <LogoutButton variant="ghost" />
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/register">Register</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <nav aria-label="Mobile navigation" className="mt-6">
              <ul className="grid gap-1" role="list">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t pt-4">
                {authenticated ? (
                  <div className="grid gap-2">
                    <span className="px-3 text-sm text-muted-foreground">
                      {user?.name}
                    </span>
                    <LogoutButton variant="ghost" className="justify-start" />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Button variant="ghost" asChild className="justify-start">
                      <Link
                        href="/auth/login"
                        onClick={() => setOpen(false)}
                      >
                        Log in
                      </Link>
                    </Button>
                    <Button asChild className="justify-start">
                      <Link
                        href="/auth/register"
                        onClick={() => setOpen(false)}
                      >
                        Register
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
