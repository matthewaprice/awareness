import { notFound } from "next/navigation";
import { getPublishedContent } from "@/actions/content";
import {
  Card,
  CardContent
} from "@/components/ui/card";

/**
 * Dynamic public content page — renders any published content by slug.
 *
 * Admin-created content pages are served at /{slug} (e.g. /about, /research, /clinical-trials).
 * Returns 404 if the slug doesn't match a published page.
 *
 * Requirements: 6.1, 6.2, 6.3
 */
export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = await getPublishedContent(slug);

  if (!content) {
    notFound();
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <article>
        <h1 className="text-3xl font-bold mb-6">{content.title}</h1>
        <Card>
          <CardContent className="prose prose-neutral max-w-none">
            <div dangerouslySetInnerHTML={{ __html: content.body }} />
          </CardContent>
        </Card>
        <p className="mt-4 text-xs text-muted-foreground">
          Last updated:{" "}
          <time dateTime={new Date(content.updatedAt).toISOString()}>
            {new Date(content.updatedAt).toLocaleDateString()}
          </time>
        </p>
      </article>
    </main>
  );
}
