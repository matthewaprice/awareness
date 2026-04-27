import { getPublishedContent } from "@/actions/content";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Public "About" page — renders published content with slug "about".
 *
 * Accessible without login (public route under (public) group).
 * Content body is rendered as HTML.
 *
 * Requirements: 6.1, 6.2, 6.3
 */
export default async function AboutPage() {
  const content = await getPublishedContent("about");

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      {content ? (
        <article>
          <h1 className="text-3xl font-bold mb-6">{content.title}</h1>
          <Card>
            <CardContent className="prose prose-neutral max-w-none pt-6">
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Content for this page has not been published yet. Please check
              back later.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
