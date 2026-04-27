"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { surveyInputSchema } from "@/lib/validation";
import {
  createSurvey,
  updateSurvey,
  publishSurvey,
  archiveSurvey,
  listAllSurveys,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SessionWithRole, SurveyInput } from "@/types";

type SurveyRow = {
  id: string;
  title: string;
  description: string;
  version: number;
  status: string;
  createdAt: Date;
  publishedAt: Date | null;
  _count: { questions: number; responses: number };
};

const statusVariant = (s: string) => {
  if (s === "PUBLISHED") return "default" as const;
  if (s === "ARCHIVED") return "secondary" as const;
  return "outline" as const;
};

export default function AdminSurveysPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const typedSession = session as unknown as SessionWithRole | null;

  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Confirm dialog for archive
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSurvey, setConfirmSurvey] = useState<SurveyRow | null>(null);

  const form = useForm<SurveyInput>({
    resolver: zodResolver(surveyInputSchema),
    defaultValues: {
      title: "",
      description: "",
      questions: [
        { questionText: "", questionType: "TEXT", required: true, orderIndex: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAllSurveys();
      setSurveys(data as unknown as SurveyRow[]);
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
          const data = await listAllSurveys();
          if (!cancelled) setSurveys(data as unknown as SurveyRow[]);
        } catch {
          // silently fail
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }
  }, [status, typedSession, router]);

  function openCreateDialog() {
    setEditingSurveyId(null);
    setFormError("");
    form.reset({
      title: "",
      description: "",
      questions: [
        { questionText: "", questionType: "TEXT", required: true, orderIndex: 0 },
      ],
    });
    setFormOpen(true);
  }

  function openEditDialog(survey: SurveyRow) {
    setEditingSurveyId(survey.id);
    setFormError("");
    form.reset({
      title: survey.title,
      description: survey.description,
      questions: [
        { questionText: "", questionType: "TEXT", required: true, orderIndex: 0 },
      ],
    });
    setFormOpen(true);
  }

  async function onSubmit(data: SurveyInput) {
    setSaving(true);
    setFormError("");
    try {
      // Assign orderIndex based on array position
      const withOrder = {
        ...data,
        questions: data.questions.map((q, i) => ({ ...q, orderIndex: i })),
      };
      if (editingSurveyId) {
        const result = await updateSurvey(editingSurveyId, withOrder);
        if (!result.success) {
          setFormError(result.errors?.[0]?.message ?? "Failed to update survey");
          return;
        }
      } else {
        const result = await createSurvey(withOrder);
        if (!result.success) {
          setFormError(result.errors?.[0]?.message ?? "Failed to create survey");
          return;
        }
      }
      setFormOpen(false);
      await fetchSurveys();
    } catch {
      setFormError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(surveyId: string) {
    try {
      await publishSurvey(surveyId);
      await fetchSurveys();
    } catch {
      // silently fail
    }
  }

  function requestArchive(survey: SurveyRow) {
    setConfirmSurvey(survey);
    setConfirmOpen(true);
  }

  async function executeArchive() {
    if (!confirmSurvey) return;
    try {
      await archiveSurvey(confirmSurvey.id);
      await fetchSurveys();
    } catch {
      // silently fail
    } finally {
      setConfirmOpen(false);
      setConfirmSurvey(null);
    }
  }

  if (status === "loading") {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Survey Management</h1>
          <p className="text-sm text-muted-foreground">Create, edit, publish, and archive surveys.</p>
        </div>
        <Button onClick={openCreateDialog}>Create Survey</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading surveys…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Responses</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No surveys yet.
                </TableCell>
              </TableRow>
            ) : (
              surveys.map((survey) => (
                <TableRow key={survey.id}>
                  <TableCell className="font-medium">{survey.title}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(survey.status)}>{survey.status}</Badge>
                  </TableCell>
                  <TableCell>{survey._count.questions}</TableCell>
                  <TableCell>{survey._count.responses}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {survey.status === "DRAFT" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(survey)}>
                            Edit
                          </Button>
                          <Button size="sm" onClick={() => handlePublish(survey.id)}>
                            Publish
                          </Button>
                        </>
                      )}
                      {survey.status === "PUBLISHED" && (
                        <Button size="sm" variant="destructive" onClick={() => requestArchive(survey)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSurveyId ? "Edit Survey" : "Create Survey"}</DialogTitle>
            <DialogDescription>
              {editingSurveyId ? "Update the survey details." : "Fill in the survey details and add questions."}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Survey title" disabled={saving} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief description" disabled={saving} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <h3 className="mb-2 text-sm font-medium">Questions</h3>
                {fields.map((field, index) => (
                  <Card key={field.id} className="mb-3">
                    <CardContent className="grid gap-3 pt-4">
                      <FormField
                        control={form.control}
                        name={`questions.${index}.questionText`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel>Question {index + 1}</FormLabel>
                            <FormControl>
                              <Input placeholder="Question text" disabled={saving} {...f} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-3">
                        <FormField
                          control={form.control}
                          name={`questions.${index}.questionType`}
                          render={({ field: f }) => (
                            <FormItem className="flex-1">
                              <FormLabel>Type</FormLabel>
                              <Select onValueChange={f.onChange} value={f.value} disabled={saving}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="TEXT">Text</SelectItem>
                                  <SelectItem value="NUMBER">Number</SelectItem>
                                  <SelectItem value="SINGLE_CHOICE">Single Choice</SelectItem>
                                  <SelectItem value="MULTI_CHOICE">Multi Choice</SelectItem>
                                  <SelectItem value="SCALE">Scale</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="mt-auto"
                            onClick={() => remove(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      {/* Options input for choice/scale types */}
                      <OptionsInput
                        index={index}
                        control={form.control}
                        disabled={saving}
                      />
                    </CardContent>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      questionText: "",
                      questionType: "TEXT",
                      required: true,
                      orderIndex: fields.length,
                    })
                  }
                >
                  Add Question
                </Button>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingSurveyId ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog (Req 7.7) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Survey</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive &quot;{confirmSurvey?.title}&quot;? This will remove it from the available surveys list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={executeArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TYPES_WITH_OPTIONS = ["SINGLE_CHOICE", "MULTI_CHOICE", "SCALE"];

/**
 * Renders an options input when the question type requires choices.
 * Options are stored as a JSON array of strings in the `options` field.
 * Users enter comma-separated values which get parsed into an array on submit.
 */
function OptionsInput({
  index,
  control,
  disabled,
}: {
  index: number;
  control: Control<SurveyInput>;
  disabled: boolean;
}) {
  const questionType = useWatch({ control, name: `questions.${index}.questionType` });

  if (!TYPES_WITH_OPTIONS.includes(questionType)) return null;

  const placeholder =
    questionType === "SCALE"
      ? "e.g. 1, 2, 3, 4, 5"
      : "e.g. Option A, Option B, Option C";

  const label =
    questionType === "SCALE" ? "Scale Values" : "Choices";

  return (
    <FormField
      control={control}
      name={`questions.${index}.options`}
      render={({ field }) => {
        // Store raw text while editing, parse to array on blur
        const initial = Array.isArray(field.value)
          ? (field.value as string[]).join(", ")
          : typeof field.value === "string"
            ? field.value
            : "";

        return (
          <FormItem>
            <FormLabel>{label} (comma-separated)</FormLabel>
            <FormControl>
              <OptionsTextInput
                initial={initial}
                placeholder={placeholder}
                disabled={disabled}
                onCommit={(parsed) => field.onChange(parsed)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

/** Keeps raw text while typing, parses to string[] on blur */
function OptionsTextInput({
  initial,
  placeholder,
  disabled,
  onCommit,
}: {
  initial: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (value: string[]) => void;
}) {
  const [text, setText] = useState(initial);

  return (
    <Input
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        onCommit(parsed);
      }}
    />
  );
}
