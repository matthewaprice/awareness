import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDashboardMetrics } from "@/actions/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SessionWithRole } from "@/types";

export default async function AdminDashboardPage() {
  const session = (await getServerSession(authOptions)) as SessionWithRole | null;

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/auth/login");
  }

  const metrics = await getDashboardMetrics();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform overview and key metrics.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.totalUsers}</p>
            <div className="mt-2 flex gap-2">
              <Badge variant="secondary">{metrics.totalPatients} Patients</Badge>
              <Badge variant="secondary">{metrics.totalPhysicians} Physicians</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Survey Completions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.surveyCompletionCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Physician Profiles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.activePhysicianProfiles}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
