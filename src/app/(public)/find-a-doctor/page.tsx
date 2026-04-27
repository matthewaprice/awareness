import { searchPhysicians } from "@/actions/physicians";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Public physician search page — "Find a Doctor".
 *
 * Uses URL search params for filter state so results are shareable.
 * No authentication required (public route under (public) group).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export default async function FindADoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const location = typeof params.location === "string" ? params.location : "";
  const name = typeof params.name === "string" ? params.name : "";
  const specialty = typeof params.specialty === "string" ? params.specialty : "";
  const pageParam = typeof params.page === "string" ? params.page : "1";
  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  const hasSearchQuery = !!(location || name || specialty);

  const results = hasSearchQuery
    ? await searchPhysicians({ location, name, specialty, page, pageSize: 10 })
    : null;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Find a Doctor</h1>
      <p className="text-muted-foreground mb-6">
        Search for physicians who specialize in treating this condition.
      </p>

      {/* Search form */}
      <Card className="mb-8">
        <CardContent>
          <form action="/find-a-doctor" method="GET" className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="location"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Location
                </label>
                <Input
                  id="location"
                  name="location"
                  placeholder="City, state, or zip"
                  defaultValue={location}
                />
              </div>
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Physician Name
                </label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Name or practice"
                  defaultValue={name}
                />
              </div>
              <div>
                <label
                  htmlFor="specialty"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Specialty
                </label>
                <Input
                  id="specialty"
                  name="specialty"
                  placeholder="e.g. Neurology"
                  defaultValue={specialty}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit">Search</Button>
              {hasSearchQuery && (
                <Button variant="outline" asChild>
                  <a href="/find-a-doctor">Clear</a>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {results !== null && (
        <section aria-label="Search results">
          {results.data.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No physicians matched your search criteria. Try broadening
                  your search by using fewer filters or different terms.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Showing {results.data.length} of {results.total} result
                {results.total !== 1 ? "s" : ""}
              </p>
              <div className="grid gap-4">
                {results.data.map((physician) => (
                  <Card key={physician.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">
                            {physician.user.fullName}
                          </CardTitle>
                          <CardDescription>
                            {physician.credentials}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">
                          {physician.specialty}
                        </Badge>
                      </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="pt-4">
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-medium text-muted-foreground">
                            Practice
                          </dt>
                          <dd>{physician.practiceName}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-muted-foreground">
                            Location
                          </dt>
                          <dd>
                            {physician.practiceAddress}, {physician.city},{" "}
                            {physician.state} {physician.zipCode}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-muted-foreground">
                            Phone
                          </dt>
                          <dd>
                            <a
                              href={`tel:${physician.phone}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {physician.phone}
                            </a>
                          </dd>
                        </div>
                        {physician.website && (
                          <div>
                            <dt className="font-medium text-muted-foreground">
                              Website
                            </dt>
                            <dd>
                              <a
                                href={physician.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                {physician.website}
                              </a>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {results.totalPages > 1 && (
                <nav
                  aria-label="Search results pagination"
                  className="mt-6 flex items-center justify-center gap-2"
                >
                  {page > 1 && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={buildPageUrl({ location, name, specialty }, page - 1)}
                      >
                        Previous
                      </a>
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground">
                    Page {results.page} of {results.totalPages}
                  </span>
                  {page < results.totalPages && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={buildPageUrl({ location, name, specialty }, page + 1)}
                      >
                        Next
                      </a>
                    </Button>
                  )}
                </nav>
              )}
            </>
          )}
        </section>
      )}

      {!hasSearchQuery && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Use the search filters above to find physicians who treat this
              condition.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function buildPageUrl(
  filters: { location: string; name: string; specialty: string },
  page: number
): string {
  const params = new URLSearchParams();
  if (filters.location) params.set("location", filters.location);
  if (filters.name) params.set("name", filters.name);
  if (filters.specialty) params.set("specialty", filters.specialty);
  if (page > 1) params.set("page", String(page));
  return `/find-a-doctor?${params.toString()}`;
}
