"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  submitSurveyResponse,
  saveSurveyDraft,
} from "@/actions/surveys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { SurveyDraft } from "@/types";

/** Auto-save interval in milliseconds */
const AUTO_SAVE_INTERVAL = 30_000;

interface SurveyQuestion {
  id: string;
  questionText: string;
  questionType: "TEXT" | "NUMBER" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "SCALE";
  options: unknown;
  required: boolean;
  orderIndex: number;
}

interface SurveyData {
  id: string;
  title: string;
  description: string;
  version: number;
  questions: SurveyQuestion[];
}

interface SurveyFormProps {
  survey: SurveyData;
  patientId: string;
  initialDraft: SurveyDraft | null;
}

/**
 * Build a dynamic Zod schema based on the survey questions.
 * Each answer is keyed by question ID.
 */
function buildSchema(questions: SurveyQuestion[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const q of questions) {
    let field: z.ZodTypeAny;

    switch (q.questionType) {
      case "NUMBER":
        field = z.coerce.number({ error: "Please enter a valid number" });
        if (!q.required) field = field.optional();
        break;
      case "MULTI_CHOICE":
        field = q.required
          ? z.array(z.string()).min(1, "Please select at least one option")
          : z.array(z.string()).optional();
        break;
      case "SCALE":
        field = z.coerce.number({ error: "Please select a value" });
        if (!q.required) field = field.optional();
        break;
      case "SINGLE_CHOICE":
        field = q.required
          ? z.string().min(1, "Please select an option")
          : z.string().optional();
        break;
      default: // TEXT
        field = q.required
          ? z.string().min(1, "This field is required")
          : z.string().optional();
    }

    shape[q.id] = field;
  }

  return z.object(shape);
}

function getOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options.map(String);
  return [];
}

export function SurveyForm({ survey, patientId, initialDraft }: SurveyFormProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(
    initialDraft?.lastSavedAt ? new Date(initialDraft.lastSavedAt) : null
  );

  const { questions } = survey;
  const schema = buildSchema(questions);
  type FormValues = z.infer<typeof schema>;

  // Build default values from draft or empty
  const defaultValues: Record<string, unknown> = {};
  for (const q of questions) {
    const draftAnswer = initialDraft?.responses?.find(
      (r) => r?.questionId === q.id
    );
    if (draftAnswer) {
      defaultValues[q.id] = draftAnswer.answer;
    } else {
      defaultValues[q.id] = q.questionType === "MULTI_CHOICE" ? [] : "";
    }
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as FormValues,
    mode: "onTouched",
  });

  const currentQuestion = questions[currentStep];
  const totalSteps = questions.length;
  const isLastStep = currentStep === totalSteps - 1;

  // Auto-save draft to Redis every 30 seconds
  const saveDraft = useCallback(async () => {
    const values = form.getValues();
    const responses = questions.map((q) => ({
      questionId: q.id,
      answer: values[q.id] as string | number | string[],
    }));

    await saveSurveyDraft({
      surveyId: survey.id,
      patientId,
      responses,
      lastSavedAt: new Date(),
    });
    setLastSaved(new Date());
  }, [form, questions, survey.id, patientId]);

  const saveDraftRef = useRef(saveDraft);
  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(() => {
      saveDraftRef.current();
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [submitted]);

  async function handleNext() {
    // Validate only the current question field before advancing
    const valid = await form.trigger(currentQuestion.id);
    if (valid && !isLastStep) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  async function onSubmit(values: FormValues) {
    setServerError("");
    setLoading(true);

    try {
      const responses = questions.map((q) => ({
        questionId: q.id,
        answer: values[q.id] as string | number | string[],
      }));

      const result = await submitSurveyResponse({
        surveyId: survey.id,
        patientId,
        responses,
      });

      if (!result.success) {
        const msg =
          result.errors?.map((e) => e.message).join(", ") ??
          "Submission failed. Please try again.";
        setServerError(msg);
        return;
      }

      setSubmitted(true);
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Confirmation screen after successful submission
  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thank You!</CardTitle>
          <CardDescription>
            Your survey response has been submitted successfully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your contribution helps build the shared knowledge base about this
            condition. You can complete additional surveys at any time.
          </p>
        </CardContent>
        <CardFooter>
          <Button onClick={() => router.push("/surveys")}>
            Back to Surveys
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{survey.title}</CardTitle>
            <CardDescription>{survey.description}</CardDescription>
          </div>
          <Badge variant="outline">
            {currentStep + 1} / {totalSteps}
          </Badge>
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-2 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
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
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-6"
            noValidate
          >
            <QuestionField
              key={currentQuestion.id}
              question={currentQuestion}
              control={form.control}
            />

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                Back
              </Button>

              {isLastStep ? (
                <Button type="submit" disabled={loading}>
                  {loading ? "Submitting…" : "Submit"}
                </Button>
              ) : (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
      {lastSaved && (
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            Draft saved {lastSaved.toLocaleTimeString()}
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

/** Renders the appropriate input for a given question type */
function QuestionField({
  question,
  control,
}: {
  question: SurveyQuestion;
  control: Control<FieldValues>;
}) {
  const options = getOptions(question.options);

  return (
    <FormField
      control={control}
      name={question.id}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {question.questionText}
            {question.required && (
              <span className="ml-1 text-destructive" aria-hidden="true">*</span>
            )}
          </FormLabel>
          <FormControl>
            {question.questionType === "TEXT" ? (
              <Input placeholder="Your answer" {...field} />
            ) : question.questionType === "NUMBER" ? (
              <Input type="number" placeholder="0" {...field} />
            ) : question.questionType === "SINGLE_CHOICE" ? (
              <Select onValueChange={field.onChange} value={field.value as string}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : question.questionType === "MULTI_CHOICE" ? (
              <MultiChoiceField
                options={options}
                value={(field.value as string[]) ?? []}
                onChange={field.onChange}
              />
            ) : question.questionType === "SCALE" ? (
              <ScaleField
                options={options}
                value={field.value as number | ""}
                onChange={field.onChange}
              />
            ) : (
              <Input placeholder="Your answer" {...field} />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Checkbox group for MULTI_CHOICE questions */
function MultiChoiceField({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (val: string[]) => void;
}) {
  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }

  return (
    <div className="grid gap-2">
      {options.map((opt) => (
        <label
          key={opt}
          className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
        >
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            className="accent-primary"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

/** Button group for SCALE questions (e.g. 1-5 or 1-10) */
function ScaleField({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: number | "";
  onChange: (val: number) => void;
}) {
  // If options are provided, use them as scale points; otherwise default 1-5
  const scalePoints =
    options.length > 0 ? options : ["1", "2", "3", "4", "5"];

  return (
    <div className="flex flex-wrap gap-2">
      {scalePoints.map((point) => {
        const numVal = Number(point);
        const isSelected = value === numVal;
        return (
          <button
            key={point}
            type="button"
            onClick={() => onChange(numVal)}
            className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
          >
            {point}
          </button>
        );
      })}
    </div>
  );
}
