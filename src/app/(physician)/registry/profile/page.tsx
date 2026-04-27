"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { physicianProfileSchema } from "@/lib/validation";
import {
  createOrUpdateProfile,
  getPhysicianProfile,
  toggleProfileVisibility,
} from "@/actions/physicians";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { PhysicianProfileInput, SessionWithRole } from "@/types";

export default function PhysicianProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const typedSession = session as unknown as SessionWithRole | null;
  const userId = typedSession?.user?.id;

  const form = useForm<PhysicianProfileInput>({
    resolver: zodResolver(physicianProfileSchema),
    defaultValues: {
      credentials: "",
      specialty: "",
      practiceName: "",
      practiceAddress: "",
      city: "",
      state: "",
      zipCode: "",
      phone: "",
      website: "",
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status === "authenticated" && userId) {
      (async () => {
        setProfileLoading(true);
        try {
          const profile = await getPhysicianProfile(userId);
          if (profile) {
            setHasProfile(true);
            setIsActive(profile.active);
            form.reset({
              credentials: profile.credentials,
              specialty: profile.specialty,
              practiceName: profile.practiceName,
              practiceAddress: profile.practiceAddress,
              city: profile.city,
              state: profile.state,
              zipCode: profile.zipCode,
              phone: profile.phone,
              website: profile.website ?? "",
            });
          }
        } catch {
          // Profile doesn't exist yet — that's fine
        } finally {
          setProfileLoading(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId]);

  async function onSubmit(data: PhysicianProfileInput) {
    if (!userId) return;
    setServerError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const result = await createOrUpdateProfile(userId, data);

      if (!result.success) {
        if (result.errors?.length) {
          result.errors.forEach((err) => {
            form.setError(err.field as keyof PhysicianProfileInput, {
              message: err.message,
            });
          });
        }
        setServerError("Please fix the errors below.");
        return;
      }

      setHasProfile(true);
      setSuccessMessage("Profile saved successfully.");
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleVisibility() {
    if (!userId) return;
    setTogglingVisibility(true);
    try {
      const newActive = !isActive;
      await toggleProfileVisibility(userId, newActive);
      setIsActive(newActive);
    } catch {
      setServerError("Failed to update profile visibility.");
    } finally {
      setTogglingVisibility(false);
    }
  }

  if (status === "loading" || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Physician Registry Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasProfile
              ? "Update your registry profile information."
              : "Create your registry profile to appear in the physician directory."}
          </p>
        </div>
        {hasProfile && (
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{hasProfile ? "Edit Profile" : "Create Profile"}</CardTitle>
          <CardDescription>
            All fields except website are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {serverError}
            </div>
          )}
          {successMessage && (
            <div
              role="status"
              className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
            >
              {successMessage}
            </div>
          )}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid gap-4"
              noValidate
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="credentials"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credentials</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="MD, DO, PhD"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="specialty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specialty</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Neurology"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="practiceName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Practice Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your practice or clinic name"
                        disabled={loading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="practiceAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Practice Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Street address"
                        disabled={loading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input disabled={loading} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input disabled={loading} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zip Code</FormLabel>
                      <FormControl>
                        <Input disabled={loading} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="(555) 123-4567"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="https://example.com"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading
                    ? "Saving…"
                    : hasProfile
                      ? "Update Profile"
                      : "Create Profile"}
                </Button>
                {hasProfile && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={togglingVisibility}
                    onClick={handleToggleVisibility}
                  >
                    {togglingVisibility
                      ? "Updating…"
                      : isActive
                        ? "Set Inactive"
                        : "Set Active"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
