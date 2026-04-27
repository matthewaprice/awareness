import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSurveyById, getSurveyDraft } from "@/actions/surveys";
import { SurveyForm } from "@/components/surveys/survey-form";
import type { SessionWithRole } from "@/types";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await getServerSession(authOptions)) as SessionWithRole | null;

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const survey = await getSurveyById(id);

  if (!survey || survey.status !== "PUBLISHED") {
    redirect("/surveys");
  }

  const draft = await getSurveyDraft(session.user.id, id);

  return (
    <div className="mx-auto w-lg sm:w-xl px-4 py-8">
      <SurveyForm
        survey={survey}
        patientId={session.user.id}
        initialDraft={draft}
      />
    </div>
  );
}
