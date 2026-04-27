import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { getAvailableSurveys } from "@/actions/surveys";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SessionWithRole } from "@/types";

export default async function SurveysPage() {
  const session = (await getServerSession(authOptions)) as SessionWithRole | null;

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const surveys = await getAvailableSurveys(session.user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Available Surveys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete surveys to contribute to the shared knowledge base about this condition.
        </p>
      </div>

      {surveys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No surveys are available at this time. Check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {surveys.map((survey) => (
            <Card key={survey.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{survey.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {survey.description}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">v{survey.version}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Published{" "}
                    {survey.publishedAt
                      ? new Date(survey.publishedAt).toLocaleDateString()
                      : "—"}
                  </p>
                  <Button asChild>
                    <Link href={`/surveys/${survey.id}`}>Start Survey</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
