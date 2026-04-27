"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { verifyEmail } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type VerifyState = "idle" | "verifying" | "success" | "error";

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = use(searchParams);
  const token = typeof params.token === "string" ? params.token : undefined;

  const [state, setState] = useState<VerifyState>(token ? "verifying" : "idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function verify() {
      try {
        const result = await verifyEmail(token!);
        if (cancelled) return;

        if (result.success) {
          setState("success");
        } else {
          setState("error");
          setErrorMessage(
            result.error ?? "Verification failed. Please try again."
          );
        }
      } catch {
        if (cancelled) return;
        setState("error");
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // No token — user just registered and needs to check their email
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>
              We&apos;ve sent a verification link to your email address. Please
              click the link to verify your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive the email? Check your spam folder or try
              registering again.
            </p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link href="/auth/login">Back to Sign In</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        {state === "verifying" && (
          <>
            <CardHeader>
              <CardTitle>Verifying Email</CardTitle>
              <CardDescription>
                Please wait while we verify your email address…
              </CardDescription>
            </CardHeader>
          </>
        )}

        {state === "success" && (
          <>
            <CardHeader>
              <CardTitle>Email Verified</CardTitle>
              <CardDescription>
                Your email has been verified successfully. You can now sign in.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Button asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </CardFooter>
          </>
        )}

        {state === "error" && (
          <>
            <CardHeader>
              <CardTitle>Verification Failed</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </CardHeader>
            <CardFooter className="justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/auth/register">Register Again</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
